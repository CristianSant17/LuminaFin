import { toCents } from './money.js';

export function normalizeDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(year, month - 1, day);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) return null;
  return result;
}

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function periodMatches(date, year = null, month = null) {
  const parsed = normalizeDate(date);
  if (!parsed) return false;
  return (year === null || parsed.getFullYear() === year)
    && (month === null || parsed.getMonth() + 1 === month);
}

function valueInCents(transaction) {
  return Number.isSafeInteger(transaction.valueCents)
    ? transaction.valueCents
    : toCents(transaction.value);
}

export function transactionStatusIsRealized(transaction) {
  return transaction.status === 'paid';
}

export function transactionStatusIsPayable(transaction) {
  return transaction.status === 'pending';
}

export function transactionStatusIsScheduled(transaction) {
  return transaction.status === 'scheduled';
}

export function transactionAccountImpact(transaction) {
  if (!transactionStatusIsRealized(transaction) || transaction.affectsAccountBalance === false) return 0;
  if (Number.isSafeInteger(transaction.accountImpactCents)) return transaction.accountImpactCents;
  if (transaction.type === 'income') return valueInCents(transaction);
  if (transaction.type === 'expense') return -valueInCents(transaction);
  return 0;
}

export function calculateRealizedBalance(transactions, initialBalanceCents = 0, throughDate = null) {
  let balance = initialBalanceCents;
  const cutoff = throughDate instanceof Date ? dateKey(throughDate) : throughDate;
  for (const transaction of transactions) {
    if (cutoff && (!normalizeDate(transaction.date) || transaction.date > cutoff)) continue;
    balance += transactionAccountImpact(transaction);
  }
  return balance;
}

export function calculateAccountBalanceAt(transactions, initialBalances = [], throughDate = null) {
  const cutoff = throughDate instanceof Date ? dateKey(throughDate) : throughDate;
  const openingCents = initialBalances.reduce((sum, item) => {
    if (!normalizeDate(item.date) || (cutoff && item.date > cutoff)) return sum;
    return sum + valueInCents(item);
  }, 0);
  return calculateRealizedBalance(transactions, openingCents, cutoff);
}

export function calculateOpeningBalance(transactions, initialBalances, periodStart) {
  const start = typeof periodStart === 'string' ? periodStart : dateKey(periodStart);
  const openingCents = initialBalances.reduce((sum, item) => {
    if (!normalizeDate(item.date) || item.date >= start) return sum;
    return sum + valueInCents(item);
  }, 0);
  return calculateRealizedBalance(
    transactions.filter((item) => item.date < start),
    openingCents,
    start
  );
}

export function calculateFilteredOpeningBalance(transactions, initialBalances, year = null, month = null) {
  const periodDates = [...transactions, ...initialBalances]
    .map((item) => item.date)
    .filter((date) => periodMatches(date, year, month))
    .sort();
  if (periodDates.length === 0) return null;
  const firstDate = normalizeDate(periodDates[0]);
  const firstPeriodStart = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}-01`;
  return calculateOpeningBalance(transactions, initialBalances, firstPeriodStart);
}

export function calculatePeriodTotals(transactions, year = null, month = null) {
  const totals = { incomeCents: 0, expenseCents: 0 };
  for (const transaction of transactions) {
    if (!periodMatches(transaction.date, year, month) || !transactionStatusIsRealized(transaction)) continue;
    const cents = valueInCents(transaction);
    if (transaction.type === 'income') totals.incomeCents += cents;
    if (transaction.type === 'expense') totals.expenseCents += cents;
  }
  return totals;
}

export function calculateCategoryExpenseTotals(transactions, year = null, month = null) {
  return transactions.reduce((sum, transaction) => {
    const isRecognizedExpense = transaction.type === 'expense'
      && (transaction.status === 'paid' || transaction.sourceType === 'creditPurchase');
    if (!isRecognizedExpense || !periodMatches(transaction.date, year, month)) return sum;
    return sum + valueInCents(transaction);
  }, 0);
}

export function calculateUnsettledPeriodTotals(transactions, year = null, month = null) {
  const totals = {
    pendingIncomeCents: 0,
    pendingExpenseCents: 0,
    scheduledIncomeCents: 0,
    scheduledExpenseCents: 0
  };
  for (const transaction of transactions) {
    if (transaction.sourceType === 'creditPurchase') continue;
    if (!periodMatches(transaction.date, year, month)) continue;
    const cents = valueInCents(transaction);
    if (transaction.status === 'pending' && transaction.type === 'income') totals.pendingIncomeCents += cents;
    if (transaction.status === 'pending' && transaction.type === 'expense') totals.pendingExpenseCents += cents;
    if (transaction.status === 'scheduled' && transaction.type === 'income') totals.scheduledIncomeCents += cents;
    if (transaction.status === 'scheduled' && transaction.type === 'expense') totals.scheduledExpenseCents += cents;
  }
  return totals;
}

export function calculatePreviousPeriodBalance(transactions, initialBalanceCents, year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return initialBalanceCents;
  }
  const lastDayBeforePeriod = dateKey(new Date(year, month - 1, 0));
  return calculateRealizedBalance(transactions, initialBalanceCents, lastDayBeforePeriod);
}

export function calculateDaysInPeriod(transactions, year = null, month = null) {
  if (Number.isInteger(year) && Number.isInteger(month)) {
    return new Date(year, month, 0).getDate();
  }
  if (Number.isInteger(year)) {
    return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
  }
  if (Number.isInteger(month)) {
    const years = new Set(
      transactions
        .filter((item) => periodMatches(item.date, null, month))
        .map((item) => Number(item.date.slice(0, 4)))
    );
    return [...years].reduce((sum, itemYear) => sum + new Date(itemYear, month, 0).getDate(), 0);
  }

  const dates = transactions.map((item) => item.date).filter((item) => normalizeDate(item)).sort();
  if (dates.length === 0) return 0;
  const start = normalizeDate(dates[0]);
  const end = normalizeDate(dates[dates.length - 1]);
  return Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
    - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
}

export function calculateDailyExpenseAverage(transactions, year = null, month = null) {
  const { expenseCents } = calculatePeriodTotals(transactions, year, month);
  const dayCount = calculateDaysInPeriod(transactions, year, month);
  return dayCount ? Math.round(expenseCents / dayCount) : 0;
}

export function calculateSavingsRate(incomeCents, expenseCents) {
  if (incomeCents <= 0) return null;
  return ((incomeCents - expenseCents) / incomeCents) * 100;
}
