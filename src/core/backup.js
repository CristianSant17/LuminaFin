import { createEmptyState } from '../storage/schema.js';

export const BACKUP_SECTIONS = Object.freeze([
  { id: 'transactions', label: 'Lançamentos e saldos iniciais' },
  { id: 'creditCards', label: 'Cartões e faturas' },
  { id: 'coffers', label: 'Cofrinhos e histórico' },
  { id: 'fixedExpenses', label: 'Gastos fixos' },
  { id: 'categories', label: 'Categorias' },
  { id: 'planning', label: 'Metas e cenários' },
  { id: 'settings', label: 'Configurações e preferências' }
]);

const SECTION_IDS = new Set(BACKUP_SECTIONS.map(({ id }) => id));
const CREDIT_TRANSACTION = (transaction) => (
  transaction?.sourceType === 'creditPurchase'
  || transaction?.sourceType === 'creditInvoicePayment'
);
const COFFER_TRANSACTION = (transaction) => Boolean(transaction?.cofferId || transaction?.cofferOperation);
const FIXED_TRANSACTION = (transaction) => transaction?.sourceType === 'fixedExpense';
const ORDINARY_TRANSACTION = (transaction) => (
  !CREDIT_TRANSACTION(transaction) && !COFFER_TRANSACTION(transaction) && !FIXED_TRANSACTION(transaction)
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) throw new TypeError('Selecione ao menos uma seção para o backup.');
  const selected = [...new Set(sections)];
  if (selected.length === 0 || selected.some((section) => !SECTION_IDS.has(section))) {
    throw new TypeError('A seleção de seções do backup é inválida.');
  }
  return selected;
}

function mergeUniqueById(target, items) {
  const byId = new Map(target.map((item) => [item.id, item]));
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

function getCategoryDependencies(state, transactions, fixedExpenses = []) {
  const ids = new Set([
    ...transactions.map((item) => item.category),
    ...fixedExpenses.map((item) => item.category)
  ].filter(Boolean));
  return state.categories.filter((category) => ids.has(category.id));
}

export function createSelectiveBackup(state, sections, exportedAt = new Date().toISOString()) {
  const selected = normalizeSections(sections);
  const included = new Set(selected);
  const backupState = createEmptyState();
  const transactions = [];
  let fixedExpenses = [];

  if (included.has('transactions')) {
    transactions.push(...state.transactions.filter(ORDINARY_TRANSACTION));
    backupState.initialBalances = clone(state.initialBalances);
  }
  if (included.has('creditCards')) {
    backupState.creditCards = clone(state.creditCards);
    backupState.creditInvoices = clone(state.creditInvoices);
    backupState.creditInstallments = clone(state.creditInstallments);
    transactions.push(...state.transactions.filter(CREDIT_TRANSACTION));
  }
  if (included.has('coffers')) {
    backupState.coffers = clone(state.coffers);
    backupState.cofferSettings = clone(state.cofferSettings);
    transactions.push(...state.transactions.filter(COFFER_TRANSACTION));
  }
  if (included.has('fixedExpenses')) {
    fixedExpenses = clone(state.fixedExpenses);
    backupState.fixedExpenses = fixedExpenses;
    transactions.push(...state.transactions.filter(FIXED_TRANSACTION));
  }
  if (included.has('categories')) backupState.categories = clone(state.categories);
  if (included.has('planning')) {
    backupState.goals = clone(state.goals);
    backupState.savingsGoals = clone(state.savingsGoals);
    backupState.scenarios = clone(state.scenarios);
  }
  if (included.has('settings')) {
    for (const key of [
      'settings', 'sort', 'pagination', 'filters', 'reportYear', 'fxRates',
      'notifications', 'deletedItems', 'missions'
    ]) {
      backupState[key] = clone(state[key]);
    }
  }

  backupState.transactions = mergeUniqueById([], transactions);
  if (!included.has('categories')) {
    backupState.categories = getCategoryDependencies(state, backupState.transactions, fixedExpenses);
  }

  return {
    schemaVersion: state.schemaVersion,
    backupVersion: 4,
    exportedAt,
    includedSections: selected,
    includedSectionLabels: Object.fromEntries(
      BACKUP_SECTIONS
        .filter(({ id }) => included.has(id))
        .map(({ id, label }) => [id, label])
    ),
    state: backupState
  };
}

export function getBackupSections(envelope) {
  if (!Array.isArray(envelope?.includedSections)) {
    return BACKUP_SECTIONS.map(({ id }) => id);
  }
  return normalizeSections(envelope.includedSections);
}

function replaceTransactionGroup(current, incoming, predicate) {
  return [
    ...current.filter((transaction) => !predicate(transaction)),
    ...incoming.filter(predicate)
  ];
}

export function restoreBackupSections(currentState, importedState, sections) {
  const selected = new Set(normalizeSections(sections));
  const result = clone(currentState);

  if (selected.has('transactions')) {
    result.transactions = replaceTransactionGroup(result.transactions, importedState.transactions, ORDINARY_TRANSACTION);
    result.initialBalances = clone(importedState.initialBalances);
  }
  if (selected.has('creditCards')) {
    for (const key of ['creditCards', 'creditInvoices', 'creditInstallments']) {
      result[key] = clone(importedState[key]);
    }
    result.transactions = replaceTransactionGroup(result.transactions, importedState.transactions, CREDIT_TRANSACTION);
  }
  if (selected.has('coffers')) {
    result.coffers = clone(importedState.coffers);
    result.cofferSettings = clone(importedState.cofferSettings);
    result.transactions = replaceTransactionGroup(result.transactions, importedState.transactions, COFFER_TRANSACTION);
  }
  if (selected.has('fixedExpenses')) {
    result.fixedExpenses = clone(importedState.fixedExpenses);
    result.transactions = replaceTransactionGroup(result.transactions, importedState.transactions, FIXED_TRANSACTION);
  }
  if (selected.has('categories')) result.categories = clone(importedState.categories);
  if (selected.has('planning')) {
    for (const key of ['goals', 'savingsGoals', 'scenarios']) result[key] = clone(importedState[key]);
  }
  if (selected.has('settings')) {
    for (const key of [
      'settings', 'sort', 'pagination', 'filters', 'reportYear', 'fxRates',
      'notifications', 'deletedItems', 'missions'
    ]) {
      result[key] = clone(importedState[key]);
    }
  }

  if (!selected.has('categories')) {
    const categoryIds = new Set(result.categories.map((category) => category.id));
    for (const dependency of importedState.categories) {
      if (!categoryIds.has(dependency.id)) {
        result.categories.push(clone(dependency));
        categoryIds.add(dependency.id);
      }
    }
  }
  return result;
}

export function getBackupReminder({
  lastBackupAt,
  lastBackupStateUpdatedAt,
  stateUpdatedAt,
  snoozedUntil,
  now = Date.now(),
  reminderDays = 30
}) {
  if (Number.isFinite(Date.parse(snoozedUntil)) && Date.parse(snoozedUntil) > now) return null;
  if (!Number.isFinite(Date.parse(lastBackupAt))) {
    return 'Você ainda não fez um backup. Exporte uma cópia para proteger seus dados.';
  }
  if (Number.isFinite(Date.parse(stateUpdatedAt))
    && Number.isFinite(Date.parse(lastBackupStateUpdatedAt))
    && Date.parse(stateUpdatedAt) > Date.parse(lastBackupStateUpdatedAt)) {
    return 'Há alterações desde o último backup. Salve uma cópia atualizada dos seus dados.';
  }
  if (now - Date.parse(lastBackupAt) >= reminderDays * 24 * 60 * 60 * 1000) {
    return 'Já faz um tempo desde o último backup. Salve uma cópia atualizada dos seus dados.';
  }
  return null;
}
