import { toCents } from './money.js';
import { dateKey, normalizeDate } from './finance.js';

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isFixedExpenseActiveInMonth(expense, date = new Date()) {
  if (expense.active !== true && expense.active !== 'true') return false;
  if (expense.type !== 'variable') return true;
  if (!expense.startMonth || !Number.isInteger(expense.duration) || expense.duration < 1) return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(expense.startMonth)) return false;
  const [startYear, startMonth] = expense.startMonth.split('-').map(Number);
  const start = new Date(startYear, startMonth - 1, 1);
  const endExclusive = new Date(startYear, startMonth - 1 + expense.duration, 1);
  const current = new Date(date.getFullYear(), date.getMonth(), 1);
  return current >= start && current < endExclusive;
}

export function resolveFixedExpenseStartMonth(type, existing, currentDate = new Date()) {
  return type === 'variable' ? (existing?.startMonth || monthKey(currentDate)) : null;
}

export function createMissingFixedExpenseOccurrences(
  fixedExpenses,
  transactions,
  date,
  createId,
  today = dateKey(new Date())
) {
  const sourceMonth = monthKey(date);
  const existingKeys = new Set(transactions
    .filter((item) => item.sourceType === 'fixedExpense')
    .map((item) => `${item.sourceId}:${item.sourceMonth}`));
  return fixedExpenses
    .filter((expense) => isFixedExpenseActiveInMonth(expense, date))
    .filter((expense) => !existingKeys.has(`${expense.id}:${sourceMonth}`))
    .map((expense) => createFixedExpenseOccurrence(expense, date, createId, today));
}

export function createFixedExpenseOccurrence(expense, date, createId, today = dateKey(new Date())) {
  if (!Number.isInteger(expense.day) || expense.day < 1 || expense.day > 31) {
    throw new RangeError('O dia do gasto fixo deve estar entre 1 e 31.');
  }
  if (!normalizeDate(dateKey(date))) throw new RangeError('Data inválida para gerar o gasto fixo.');
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = Math.min(expense.day, new Date(year, month + 1, 0).getDate());
  const occurrenceDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const valueCents = Number.isSafeInteger(expense.valueCents)
    ? expense.valueCents
    : toCents(expense.value);
  const status = occurrenceDate > today ? 'scheduled' : 'pending';
  const timestamp = new Date().toISOString();
  return {
    id: createId(),
    date: occurrenceDate,
    category: expense.category,
    subcategory: expense.description,
    type: 'expense',
    description: expense.description,
    value: valueCents / 100,
    valueCents,
    payment: 'Débito',
    status,
    sourceType: 'fixedExpense',
    sourceId: expense.id,
    sourceMonth: monthKey(date),
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1
  };
}
