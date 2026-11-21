import {
  calculatePeriodTotals,
  calculateUnsettledPeriodTotals
} from './finance.js';
import { isFixedExpenseActiveInMonth } from './fixed-expenses.js';
import { calculateCofferBalance } from './coffers.js';

export function summarizeMonthlyBudget({ transactions, fixedExpenses, year, month }) {
  if (!Array.isArray(transactions) || !Array.isArray(fixedExpenses)
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

  const committedExpenseCents = realized.expenseCents
    + unsettled.pendingExpenseCents
    + unsettled.scheduledExpenseCents
    + ungeneratedFixedExpenseCents;
  return {
    paidIncomeCents: realized.incomeCents,
    paidExpenseCents: realized.expenseCents,
    pendingIncomeCents: unsettled.pendingIncomeCents,
    pendingExpenseCents: unsettled.pendingExpenseCents,
    scheduledIncomeCents: unsettled.scheduledIncomeCents,
    scheduledExpenseCents: unsettled.scheduledExpenseCents,
    ungeneratedFixedExpenseCents,
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
      const losesYield = coffer.allowWithdrawalWithoutYieldLoss !== true
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

export function evaluatePurchaseDecision({
  amountCents,
  installments,
  accountBalanceCents,
  monthlyPosition,
  coffers,
  transactions
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