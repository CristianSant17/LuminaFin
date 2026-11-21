import {
  calculateAccountBalanceAt,
  calculatePeriodTotals,
  calculateUnsettledPeriodTotals
} from './finance.js';
import { isFixedExpenseActiveInMonth } from './fixed-expenses.js';
import { calculateCofferBalance, calculateCofferBalances } from './coffers.js';

export function summarizeFinancialPosition({
  transactions,
  initialBalances,
  coffers,
  throughDate = null
}) {
  if (!Array.isArray(transactions) || !Array.isArray(initialBalances) || !Array.isArray(coffers)) {
    throw new TypeError('Lançamentos, saldos iniciais e cofrinhos válidos são obrigatórios.');
  }
  const accountCents = calculateAccountBalanceAt(transactions, initialBalances, throughDate);
  const cofferBalances = calculateCofferBalances(coffers, transactions, throughDate);
  const principalCents = cofferBalances.reduce((sum, item) => sum + item.principalCents, 0);
  const yieldCents = cofferBalances.reduce((sum, item) => sum + item.yieldCents, 0);
  const cofferCents = principalCents + yieldCents;
  return {
    accountCents,
    principalCents,
    yieldCents,
    cofferCents,
    netWorthCents: accountCents + cofferCents
  };
}

export function summarizeMonthlyBudget({
  transactions,
  fixedExpenses,
  creditInstallments = [],
  year,
  month
}) {
  if (!Array.isArray(transactions) || !Array.isArray(fixedExpenses)
    || !Array.isArray(creditInstallments)
    || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new TypeError('Lançamentos, gastos fixos e período válido são obrigatórios.');
  }

  const realized = calculatePeriodTotals(transactions, year, month);
  const unsettled = calculateUnsettledPeriodTotals(transactions, year, month);
  const sourceMonth = `${year}-${String(month).padStart(2, '0')}`;
  const ungeneratedFixedExpenseCents = fixedExpenses
    .filter((expense) => isFixedExpenseActiveInMonth(expense, new Date(year, month - 1, 1)))
    .filter((expense) => !transactions.some((transaction) => (
      transaction.sourceType === 'fixedExpense'
      && transaction.sourceId === expense.id
      && transaction.sourceMonth === sourceMonth
    )))
    .reduce((sum, expense) => sum + (
      Number.isSafeInteger(expense.valueCents)
        ? expense.valueCents
        : Math.round((Number(expense.value) || 0) * 100)
    ), 0);

  const creditInvoiceCents = creditInstallments
    .filter((item) => item.invoiceMonth === sourceMonth)
    .reduce((sum, item) => sum + Math.max(0, item.amountCents - item.paidCents), 0);
  const creditItemsThisMonth = creditInstallments.filter((item) => item.invoiceMonth === sourceMonth);
  const installmentCreditCents = creditItemsThisMonth
    .filter((item) => item.installmentCount > 1)
    .reduce((sum, item) => sum + Math.max(0, item.amountCents - item.paidCents), 0);
  const singlePaymentCreditCents = creditInvoiceCents - installmentCreditCents;
  const nextMonthDate = new Date(year, month, 1);
  const nextSourceMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const nextCreditInvoiceCents = creditInstallments
    .filter((item) => item.invoiceMonth === nextSourceMonth)
    .reduce((sum, item) => sum + Math.max(0, item.amountCents - item.paidCents), 0);
  const committedExpenseCents = realized.expenseCents
    + unsettled.pendingExpenseCents
    + unsettled.scheduledExpenseCents
    + ungeneratedFixedExpenseCents
    + creditInvoiceCents;
  return {
    paidIncomeCents: realized.incomeCents,
    paidExpenseCents: realized.expenseCents,
    pendingIncomeCents: unsettled.pendingIncomeCents,
    pendingExpenseCents: unsettled.pendingExpenseCents,
    scheduledIncomeCents: unsettled.scheduledIncomeCents,
    scheduledExpenseCents: unsettled.scheduledExpenseCents,
    ungeneratedFixedExpenseCents,
    creditInvoiceCents,
    installmentCreditCents,
    singlePaymentCreditCents,
    nextCreditInvoiceCents,
    creditInvoiceTrendCents: nextCreditInvoiceCents - creditInvoiceCents,
    committedExpenseCents,
    safeRemainingCents: realized.incomeCents - committedExpenseCents,
    expectedRemainingCents: realized.incomeCents
      + unsettled.pendingIncomeCents
      + unsettled.scheduledIncomeCents
      - committedExpenseCents
  };
}

export function suggestCofferWithdrawals({ coffers, transactions, shortfallCents }) {
  if (!Array.isArray(coffers) || !Array.isArray(transactions)
    || !Number.isSafeInteger(shortfallCents) || shortfallCents <= 0) return [];

  return coffers
    .filter((coffer) => coffer.active !== false)
    .map((coffer) => {
      const balance = calculateCofferBalance(coffer, transactions);
      if (balance.totalCents <= 0) return null;
      const losesYield = coffer.allowWithdrawalWithoutYieldLoss !== true;
      let grossWithdrawalCents = shortfallCents;
      if (losesYield && balance.principalCents > 0) {
        grossWithdrawalCents = Number((BigInt(shortfallCents) * BigInt(balance.totalCents)
          + BigInt(balance.principalCents) - 1n) / BigInt(balance.principalCents));
      }
      grossWithdrawalCents = Math.min(balance.totalCents, grossWithdrawalCents);
      const principalPartCents = balance.totalCents > 0
        ? Number((BigInt(grossWithdrawalCents) * BigInt(balance.principalCents)
          + BigInt(balance.totalCents) / 2n) / BigInt(balance.totalCents))
        : 0;
      const yieldLossCents = losesYield
        ? grossWithdrawalCents - principalPartCents
        : 0;
      const netReceivedCents = grossWithdrawalCents - yieldLossCents;
      return {
        cofferId: coffer.id,
        name: coffer.name,
        type: coffer.type,
        grossWithdrawalCents,
        netReceivedCents,
        yieldLossCents,
        coversShortfall: netReceivedCents >= shortfallCents
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.coversShortfall) - Number(left.coversShortfall)
      || left.yieldLossCents - right.yieldLossCents
      || left.grossWithdrawalCents - right.grossWithdrawalCents);
}

export function estimateCofferMonthlyYieldCents(coffers, transactions, settings = {}) {
  if (!Array.isArray(coffers) || !Array.isArray(transactions)) {
    throw new TypeError('Cofrinhos e lançamentos válidos são obrigatórios.');
  }
  const cdiAnnual = (settings.annualCdiBps || 0) / 10000;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return coffers.reduce((sum, coffer) => {
    if (coffer.active === false) return sum;
    const balance = calculateCofferBalance(coffer, transactions);
    if (balance.totalCents <= 0) return sum;
    let monthlyRate = Number.isSafeInteger(coffer.monthlyRateBps)
      ? coffer.monthlyRateBps / 10000
      : cdiAnnual * (Number.isSafeInteger(coffer.bonusCdiBps) ? coffer.bonusCdiBps : 10000) / 10000 / 12;
    if (coffer.promoEndDate && todayKey > coffer.promoEndDate && coffer.promoAfter === 'excess') {
      monthlyRate = cdiAnnual * (coffer.excessCdiBps || 10000) / 10000 / 12;
    }
    return sum + Math.max(0, Math.round(balance.totalCents * monthlyRate));
  }, 0);
}

export function evaluatePurchaseDecision({
  amountCents,
  installments,
  accountBalanceCents,
  monthlyPosition,
  coffers,
  transactions,
  cofferSettings = {}
}) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0
    || !Number.isInteger(installments) || installments < 1
    || !Number.isSafeInteger(accountBalanceCents)
    || !monthlyPosition || !Array.isArray(coffers) || !Array.isArray(transactions)) {
    throw new TypeError('Valor, parcelas e posição financeira válidos são obrigatórios.');
  }
  const installmentCents = Math.ceil(amountCents / installments);
  const cashNeedCents = installments === 1 ? amountCents : installmentCents;
  const estimatedIncomeCents = monthlyPosition.estimatedIncomeCents || 0;
  const estimatedExpenseCents = monthlyPosition.estimatedExpenseCents || 0;
  const safeRemainingAfterPurchaseCents = monthlyPosition.safeRemainingCents
    - installmentCents
    - estimatedExpenseCents;
  const safeMonthEndAccountAfterPurchaseCents = accountBalanceCents
    - monthlyPosition.pendingExpenseCents
    - monthlyPosition.scheduledExpenseCents
    - monthlyPosition.ungeneratedFixedExpenseCents
    - (monthlyPosition.creditInvoiceCents || 0)
    - estimatedExpenseCents
    - installmentCents;
  const monthEndAccountAfterPurchaseCents = safeMonthEndAccountAfterPurchaseCents
    + monthlyPosition.pendingIncomeCents
    + monthlyPosition.scheduledIncomeCents
    + estimatedIncomeCents;
  const cashShortfallCents = Math.max(
    0,
    cashNeedCents - accountBalanceCents,
    -safeMonthEndAccountAfterPurchaseCents
  );
  const cofferOptions = suggestCofferWithdrawals({
    coffers,
    transactions,
    shortfallCents: cashShortfallCents
  });
  const comfortMarginCents = Math.max(5000, Math.round(monthlyPosition.paidIncomeCents * 0.1));
  const suggestedCoffer = cofferOptions.find((option) => option.coversShortfall) || null;
  const reserveCents = coffers.reduce((sum, coffer) => (
    coffer.active === false ? sum : sum + calculateCofferBalance(coffer, transactions).totalCents
  ), 0);
  const reserveMonthlyYieldCents = estimateCofferMonthlyYieldCents(coffers, transactions, cofferSettings);

  let verdict;
  if (cashShortfallCents > 0 && !suggestedCoffer) verdict = 'not-affordable';
  else if (safeRemainingAfterPurchaseCents < 0) verdict = 'tight';
  else if (safeRemainingAfterPurchaseCents < comfortMarginCents) verdict = 'tight';
  else verdict = 'comfortable';

  return {
    amountCents,
    installments,
    installmentCents,
    accountAfterFirstPaymentCents: accountBalanceCents - cashNeedCents,
    safeMonthEndAccountAfterPurchaseCents,
    monthEndAccountAfterPurchaseCents,
    safeRemainingAfterPurchaseCents,
    cashShortfallCents,
    cofferOptions,
    reserveCents,
    reserveMonthlyYieldCents,
    immediateCapacityCents: Math.max(0, accountBalanceCents
      - monthlyPosition.pendingExpenseCents
      - monthlyPosition.scheduledExpenseCents
      - monthlyPosition.creditInvoiceCents),
    reserveCoverageCents: suggestedCoffer?.netReceivedCents || 0,
    suggestedCoffer,
    verdict
  };
}

export function simulateLongTermSavings({
  initialCents,
  monthlyContributionCents,
  annualReturnBps,
  annualInflationBps,
  years
}) {
  const values = [initialCents, monthlyContributionCents, annualReturnBps, annualInflationBps];
  if (!values.every(Number.isSafeInteger)
    || initialCents < 0 || monthlyContributionCents < 0
    || annualReturnBps < 0 || annualInflationBps < 0
    || !Number.isInteger(years) || years < 1 || years > 80) {
    throw new RangeError('Parâmetros inválidos para simular o horizonte financeiro.');
  }

  const monthCount = years * 12;
  const monthlyReturn = Math.pow(1 + annualReturnBps / 10000, 1 / 12) - 1;
  let balanceCents = initialCents;
  const points = [];
  for (let month = 1; month <= monthCount; month += 1) {
    balanceCents = Math.round(balanceCents * (1 + monthlyReturn)) + monthlyContributionCents;
    if (month % 12 === 0) {
      const inflationFactor = Math.pow(1 + annualInflationBps / 10000, month / 12);
      points.push({
        year: month / 12,
        nominalCents: balanceCents,
        realCents: Math.round(balanceCents / inflationFactor)
      });
    }
  }

  return {
    years,
    initialCents,
    monthlyContributionCents,
    totalContributionsCents: initialCents + monthlyContributionCents * monthCount,
    finalNominalCents: balanceCents,
    finalRealCents: points.at(-1)?.realCents ?? initialCents,
    points
  };
}