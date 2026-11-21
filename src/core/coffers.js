import { DEFAULT_COFFER_SETTINGS } from '../storage/schema.js';
import { dateKey, normalizeDate } from './finance.js';

const DAY_MS = 86400000;

function cents(value) {
  return Number.isSafeInteger(value) ? value : 0;
}

function dateNumber(value) {
  const parsed = normalizeDate(value);
  return parsed ? Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
}

function dateDifferenceDays(fromDate, toDate) {
  const from = dateNumber(fromDate);
  const to = dateNumber(toDate);
  return from === null || to === null ? 0 : Math.max(0, Math.floor((to - from) / DAY_MS));
}

function addDays(date, days) {
  const parsed = normalizeDate(date);
  if (!parsed) return null;
  return dateKey(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + days));
}

function isBusinessDay(date) {
  const parsed = normalizeDate(date);
  return parsed && parsed.getDay() !== 0 && parsed.getDay() !== 6;
}

export function countBusinessDays(startDate, endDate) {
  if (!normalizeDate(startDate) || !normalizeDate(endDate) || endDate < startDate) return 0;
  let count = 0;
  for (let date = addDays(startDate, 1); date && date <= endDate; date = addDays(date, 1)) {
    if (isBusinessDay(date)) count += 1;
  }
  return count;
}

function normalizedSettings(settings = {}) {
  return { ...DEFAULT_COFFER_SETTINGS, ...settings };
}

function cofferEvents(coffer, transactions, asOfDate = null, includeUnsettled = false) {
  return transactions
    .filter((item) => item.cofferId === coffer.id
      && item.cofferOperation
      && item.date <= (asOfDate || '9999-12-31')
      && (item.status === 'paid' || (includeUnsettled && ['pending', 'scheduled'].includes(item.status))))
    .sort((a, b) => a.date.localeCompare(b.date)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function calculateCofferBalance(coffer, transactions, asOfDate = null, includeUnsettled = false) {
  let principalCents = cents(coffer.principalCents);
  let yieldCents = cents(coffer.yieldCents);
  for (const transaction of cofferEvents(coffer, transactions, asOfDate, includeUnsettled)) {
    principalCents += cents(transaction.cofferPrincipalDeltaCents);
    yieldCents += cents(transaction.cofferYieldDeltaCents);
  }
  principalCents = Math.max(0, principalCents);
  yieldCents = Math.max(0, yieldCents);
  return {
    principalCents,
    yieldCents,
    totalCents: principalCents + yieldCents
  };
}

export function calculateCofferBalances(coffers, transactions, asOfDate = null, includeUnsettled = false) {
  return coffers.map((coffer) => ({
    cofferId: coffer.id,
    ...calculateCofferBalance(coffer, transactions, asOfDate, includeUnsettled)
  }));
}

function monthOf(date) {
  return date.slice(0, 7);
}

function previousMonthKey(date) {
  const parsed = normalizeDate(date);
  if (!parsed) return '';
  return monthOf(dateKey(new Date(parsed.getFullYear(), parsed.getMonth() - 1, 1)));
}

function qualifiedMonthlyDeposit(coffer, transactions, asOfDate) {
  if (!coffer.monthlyDepositGoalCents) return true;
  const targetMonth = previousMonthKey(asOfDate);
  const amount = transactions
    .filter((item) => item.cofferId === coffer.id
      && item.cofferOperation === 'deposit'
      && item.status === 'paid'
      && monthOf(item.date) === targetMonth)
    .reduce((sum, item) => sum + Math.max(0, cents(item.cofferPrincipalDeltaCents)), 0);
  return amount >= coffer.monthlyDepositGoalCents;
}

function applicableMultiplierBps(coffer, settings, transactions, asOfDate) {
  const isTurnCampaign = coffer.type === 'turn'
    && asOfDate >= (coffer.campaignStartDate || settings.turnStartDate)
    && asOfDate <= (coffer.campaignEndDate || settings.turnEndDate);
  if (isTurnCampaign) return settings.turnBonusBps;
  if (coffer.type === 'marketplace' && asOfDate <= settings.marketplacePromoEndDate) {
    return settings.marketplaceBonusBps;
  }
  if (coffer.type === 'common' && settings.commonRequiresMonthlyGoal
    && !qualifiedMonthlyDeposit(coffer, transactions, asOfDate)) {
    return settings.commonBaseBps;
  }
  if (coffer.type === 'common') return settings.commonBonusBps;
  return settings.commonBaseBps;
}

function orderedCommonCoffers(coffers) {
  return coffers
    .filter((item) => item.type === 'common' && item.active !== false)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      || String(a.id).localeCompare(String(b.id)));
}

function getDailyInterestCents(balanceCents, annualCdiBps, multiplierBps, businessDaysPerYear) {
  if (balanceCents <= 0 || annualCdiBps <= 0 || multiplierBps <= 0) return 0;
  const annualRate = annualCdiBps / 10000;
  const cdiDailyRate = Math.pow(1 + annualRate, 1 / businessDaysPerYear) - 1;
  const effectiveDailyRate = cdiDailyRate * multiplierBps / 10000;
  return Math.round(balanceCents * effectiveDailyRate);
}

function getTaxRateBps(settings, averageHoldingDays) {
  if (!settings.incomeTaxEnabled) return 0;
  const bracket = settings.incomeTaxBrackets.find((item) => (
    item.maxDays === null || averageHoldingDays <= item.maxDays
  ));
  return bracket?.rateBps || 0;
}

function weightedHoldingDays(coffer, transactions, asOfDate) {
  const deposits = cofferEvents(coffer, transactions, asOfDate)
    .filter((item) => cents(item.cofferPrincipalDeltaCents) > 0)
    .map((item) => ({
      amount: cents(item.cofferPrincipalDeltaCents),
      date: item.date
    }));
  if (cents(coffer.principalCents) > 0) {
    deposits.push({
      amount: cents(coffer.principalCents),
      date: coffer.createdAt?.slice(0, 10) || asOfDate
    });
  }
  const total = deposits.reduce((sum, item) => sum + item.amount, 0);
  if (total <= 0) return dateDifferenceDays(coffer.createdAt?.slice(0, 10) || asOfDate, asOfDate);
  return Math.round(deposits.reduce(
    (sum, item) => sum + item.amount * dateDifferenceDays(item.date, asOfDate),
    0
  ) / total);
}

function readBalancesForAccrual(coffers, transactions, asOfDate, accrualBalance) {
  return coffers.map((coffer) => {
    const balance = accrualBalance.has(coffer.id)
      ? accrualBalance.get(coffer.id)
      : calculateCofferBalance(coffer, transactions, asOfDate);
    const principalCents = cents(balance.principalCents);
    const yieldCents = cents(balance.yieldCents);
    return {
      ...coffer,
      principalCents,
      yieldCents,
      totalCents: principalCents + yieldCents
    };
  });
}

function resolveCommonTierAmounts(coffer, cofferBalances, capCents) {
  const common = orderedCommonCoffers(cofferBalances);
  let usedCents = 0;
  for (const current of common) {
    const eligibleCents = Math.min(current.totalCents, Math.max(0, capCents - usedCents));
    if (current.id === coffer.id) {
      return {
        eligibleCents,
        excessCents: current.totalCents - eligibleCents
      };
    }
    usedCents += current.totalCents;
  }
  return { eligibleCents: 0, excessCents: 0 };
}

function transitionOperationBalance(balance, transaction) {
  return {
    principalCents: Math.max(0, balance.principalCents + cents(transaction.cofferPrincipalDeltaCents)),
    yieldCents: Math.max(0, balance.yieldCents + cents(transaction.cofferYieldDeltaCents))
  };
}

export function simulateCofferYield({
  coffer,
  coffers,
  transactions,
  settings = {},
  startDate,
  endDate
}) {
  if (!coffer || !Array.isArray(coffers) || !Array.isArray(transactions)) {
    throw new TypeError('Cofrinho, lista de cofrinhos e lançamentos são obrigatórios.');
  }
  if (!normalizeDate(startDate) || !normalizeDate(endDate) || endDate < startDate) {
    throw new RangeError('Período inválido para simular rendimento.');
  }
  const rules = normalizedSettings(settings);
  const openingBalances = new Map(coffers.map((item) => [
    item.id,
    calculateCofferBalance(item, transactions, startDate)
  ]));
  const workingBalances = new Map(openingBalances);
  const dailyEvents = new Map();
  for (const transaction of transactions) {
    if (!transaction.cofferId || transaction.status !== 'paid'
      || transaction.date <= startDate || transaction.date > endDate) continue;
    if (!dailyEvents.has(transaction.date)) dailyEvents.set(transaction.date, []);
    dailyEvents.get(transaction.date).push(transaction);
  }

  let businessDays = 0;
  let grossInterestCents = 0;
  const rangeBreakdown = { promotionalCents: 0, baseCents: 0 };
  for (let date = addDays(startDate, 1); date && date <= endDate; date = addDays(date, 1)) {
    if (isBusinessDay(date)) {
      businessDays += 1;
      const currentBalances = readBalancesForAccrual(coffers, transactions, date, workingBalances)
        .map((item) => resolveCofferTransition(item, transactions, date));
      let targetGrossForDay = 0;
      const dailyCoffers = currentBalances.filter((item) => item.type === 'common' || item.id === coffer.id);
      for (const current of dailyCoffers) {
        if (current.active === false || current.totalCents <= 0) continue;
        let currentGrossForDay = 0;
        if (current.type === 'common') {
          const promoActive = (!current.promoStartDate || date >= current.promoStartDate)
            && (!current.promoEndDate || date <= current.promoEndDate);
          const customCapCents = Number.isSafeInteger(current.bonusCapCents) && current.bonusCapCents >= 0
            ? current.bonusCapCents
            : null;
          const tiers = customCapCents === null
            ? resolveCommonTierAmounts(current, currentBalances, rules.commonTierCapCents)
            : { eligibleCents: Math.min(current.totalCents, customCapCents), excessCents: Math.max(0, current.totalCents - customCapCents) };
          const multiplier = Number.isSafeInteger(current.bonusCdiBps)
            ? (promoActive ? current.bonusCdiBps : (current.promoAfter === 'excess' && Number.isSafeInteger(current.excessCdiBps)
              ? current.excessCdiBps
              : rules.commonBaseBps))
            : applicableMultiplierBps(current, rules, transactions, date);
          const eligibleInterest = getDailyInterestCents(
            tiers.eligibleCents,
            rules.annualCdiBps,
            multiplier,
            rules.businessDaysPerYear
          );
          const excessInterest = getDailyInterestCents(
            tiers.excessCents,
            rules.annualCdiBps,
            Number.isSafeInteger(current.excessCdiBps) ? current.excessCdiBps : rules.commonBaseBps,
            rules.businessDaysPerYear
          );
          currentGrossForDay = eligibleInterest + excessInterest;
          if (current.id === coffer.id) {
            if (multiplier > rules.commonBaseBps) rangeBreakdown.promotionalCents += eligibleInterest;
            else rangeBreakdown.baseCents += eligibleInterest;
            rangeBreakdown.baseCents += excessInterest;
          }
        } else if (current.type === 'turn') {
          const multiplier = applicableMultiplierBps(current, rules, transactions, date);
          const eligibleCents = Math.min(current.totalCents, rules.turnTierCapCents);
          const excessCents = current.totalCents - eligibleCents;
          const eligibleInterest = getDailyInterestCents(
            eligibleCents,
            rules.annualCdiBps,
            multiplier,
            rules.businessDaysPerYear
          );
          const excessInterest = getDailyInterestCents(
            excessCents,
            rules.annualCdiBps,
            rules.commonBaseBps,
            rules.businessDaysPerYear
          );
          currentGrossForDay = eligibleInterest + excessInterest;
          if (current.id === coffer.id) {
            if (multiplier > rules.commonBaseBps) rangeBreakdown.promotionalCents += eligibleInterest;
            else rangeBreakdown.baseCents += eligibleInterest;
            rangeBreakdown.baseCents += excessInterest;
          }
        } else {
          const multiplier = applicableMultiplierBps(current, rules, transactions, date);
          currentGrossForDay = getDailyInterestCents(
            current.totalCents,
            rules.annualCdiBps,
            multiplier,
            rules.businessDaysPerYear
          );
          if (current.id === coffer.id) {
            if (multiplier > rules.commonBaseBps) rangeBreakdown.promotionalCents += currentGrossForDay;
            else rangeBreakdown.baseCents += currentGrossForDay;
          }
        }
        if (currentGrossForDay > 0) {
          const balance = workingBalances.get(current.id);
          workingBalances.set(current.id, {
            principalCents: balance.principalCents,
            yieldCents: balance.yieldCents + currentGrossForDay
          });
          if (current.id === coffer.id) targetGrossForDay = currentGrossForDay;
        }
      }
      grossInterestCents += targetGrossForDay;
    }

    for (const transaction of dailyEvents.get(date) || []) {
      if (!workingBalances.has(transaction.cofferId)) continue;
      workingBalances.set(
        transaction.cofferId,
        transitionOperationBalance(workingBalances.get(transaction.cofferId), transaction)
      );
    }
  }

  const averageHoldingDays = weightedHoldingDays(coffer, transactions, endDate);
  const incomeTaxBps = getTaxRateBps(rules, averageHoldingDays);
  const incomeTaxCents = Math.round(grossInterestCents * incomeTaxBps / 10000);
  const iofCents = rules.iofEnabled && averageHoldingDays <= rules.iofMaxDays
    ? Math.round(grossInterestCents * rules.iofBps / 10000)
    : 0;
  const netInterestCents = Math.max(0, grossInterestCents - incomeTaxCents - iofCents);
  const openingBalance = openingBalances.get(coffer.id) || { totalCents: 0 };
  const closingBalance = workingBalances.get(coffer.id) || { principalCents: 0, yieldCents: 0 };
  return {
    cofferId: coffer.id,
    startDate,
    endDate,
    businessDays,
    openingBalanceCents: openingBalance.totalCents,
    grossInterestCents,
    incomeTaxBps,
    incomeTaxCents,
    iofCents,
    netInterestCents,
    closingBalanceCents: Math.max(
      0,
      closingBalance.principalCents + closingBalance.yieldCents - incomeTaxCents - iofCents
    ),
    averageHoldingDays,
    annualCdiBps: rules.annualCdiBps,
    rangeBreakdown
  };
}

export function createCofferOperation({
  coffer,
  coffers,
  transactions,
  operation,
  amountCents,
  date,
  status = 'paid',
  id,
  description,
  category = '',
  settings = {}
}) {
  if (!coffer || !Array.isArray(coffers) || !Array.isArray(transactions)) {
    throw new TypeError('Cofrinho, lista de cofrinhos e lançamentos são obrigatórios.');
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError('O valor da operação deve ser positivo e informado em centavos.');
  }
  if (!normalizeDate(date)) throw new RangeError('A data da operação é inválida.');
  if (!['paid', 'pending', 'scheduled'].includes(status)) throw new Error('Status da operação inválido.');
  if (!['opening', 'deposit', 'withdrawal', 'purchase', 'yield'].includes(operation)) {
    throw new Error('Operação de cofrinho não reconhecida.');
  }
  if (!coffer.active && operation !== 'opening') throw new Error('Este cofrinho está inativo.');

  const balance = calculateCofferBalance(coffer, transactions);
  let principalDelta = 0;
  let yieldDelta = 0;
  let accountImpactCents = 0;
  let type = 'transfer';
  let netAmountCents = amountCents;
  let yieldLossCents = 0;
  const rules = normalizedSettings(settings);

  if (operation === 'opening') {
    principalDelta = amountCents;
  } else if (operation === 'deposit') {
    const maxDeposit = Number.isSafeInteger(coffer.depositLimitCents) && coffer.depositLimitCents > 0
      ? coffer.depositLimitCents
      : null;
    if (maxDeposit !== null && balance.totalCents + amountCents > maxDeposit) {
      throw new RangeError(`Depósito excede o limite de ${maxDeposit} centavos deste cofrinho.`);
    }
    principalDelta = amountCents;
    accountImpactCents = -amountCents;
  } else if (operation === 'withdrawal') {
    if (amountCents > balance.totalCents) throw new RangeError('O resgate excede o saldo do cofrinho.');
    const principalPartCents = balance.totalCents
      ? Math.round(amountCents * balance.principalCents / balance.totalCents)
      : 0;
    const yieldPartCents = amountCents - principalPartCents;
    const penalized = coffer.allowWithdrawalWithoutYieldLoss !== true;
    principalDelta = -principalPartCents;
    yieldDelta = -yieldPartCents;
    yieldLossCents = penalized ? yieldPartCents : 0;
    netAmountCents = amountCents - yieldLossCents;
    accountImpactCents = netAmountCents;
  } else if (operation === 'purchase') {
    if (coffer.paymentEnabled !== true) {
      throw new Error('Pagamentos estão desabilitados para este cofrinho.');
    }
    if (amountCents > balance.totalCents) throw new RangeError('A compra excede o saldo do cofrinho.');
    principalDelta = -Math.min(balance.principalCents, amountCents);
    yieldDelta = -(amountCents + principalDelta);
    accountImpactCents = 0;
    type = 'expense';
  } else if (operation === 'yield') {
    yieldDelta = amountCents;
    accountImpactCents = 0;
    type = 'income';
  }

  const now = new Date().toISOString();
  return {
    id,
    date,
    type,
    status,
    valueCents: type === 'income' ? amountCents : amountCents,
    value: amountCents / 100,
    category: type === 'expense' || type === 'income' ? category : '',
    description: description || `Cofrinho: ${operation}`,
    payment: 'Cofrinho',
    cofferId: coffer.id,
    cofferOperation: operation,
    cofferPrincipalDeltaCents: principalDelta,
    cofferYieldDeltaCents: yieldDelta,
    cofferYieldLossCents: yieldLossCents,
    cofferNetAmountCents: netAmountCents,
    accountImpactCents,
    affectsAccountBalance: accountImpactCents !== 0,
    sourceType: 'coffer',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    version: 1
  };
}

export function resolveCofferTransition(coffer, transactions, asOfDate) {
  if (coffer.type !== 'turn' || !normalizeDate(asOfDate)) return coffer;
  const campaignEnd = coffer.campaignEndDate || DEFAULT_COFFER_SETTINGS.turnEndDate;
  if (asOfDate <= campaignEnd) return coffer;
  const hasActivity = cofferEvents(coffer, transactions, asOfDate).length > 0;
  const balance = calculateCofferBalance(coffer, transactions, asOfDate);
  if (!hasActivity && balance.totalCents === 0) return coffer;
  const timestamp = new Date().toISOString();
  return {
    ...coffer,
    type: 'common',
    transitionedAt: asOfDate,
    updatedAt: timestamp,
    version: (coffer.version || 1) + 1
  };
}

export function getCofferRateDescription(
  coffer,
  coffers,
  settings = {},
  asOfDate = dateKey(new Date()),
  transactions = []
) {
  const rules = normalizedSettings(settings);
  if (coffer.type === 'common') {
    const commonCoffers = orderedCommonCoffers(coffers);
    const position = commonCoffers.findIndex((item) => item.id === coffer.id);
    const usedBeforeCents = commonCoffers.slice(0, position).reduce(
      (sum, item) => sum + calculateCofferBalance(item, transactions).totalCents,
      0
    );
    return {
      bonusBps: applicableMultiplierBps(coffer, rules, transactions, asOfDate),
      baseBps: rules.commonBaseBps,
      tierCapCents: rules.commonTierCapCents,
      eligibleCents: Math.max(0, Math.min(
        calculateCofferBalance(coffer, transactions).totalCents,
        rules.commonTierCapCents - usedBeforeCents
      ))
    };
  }
  const bonusBps = applicableMultiplierBps(coffer, rules, transactions, asOfDate);
  return {
    bonusBps,
    baseBps: rules.commonBaseBps,
    tierCapCents: coffer.type === 'turn' ? rules.turnTierCapCents : null,
    eligibleCents: null
  };
}

