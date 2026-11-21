import { toCents } from '../core/money.js';

export const STORAGE_KEY = 'LuminaFin-v1';
export const SCHEMA_VERSION = 4;

export const DEFAULT_COFFER_SETTINGS = Object.freeze({
  annualCdiBps: 1200,
  businessDaysPerYear: 252,
  commonBaseBps: 10000,
  commonBonusBps: 11500,
  commonTierCapCents: 500000,
  commonRequiresMonthlyGoal: false,
  turnBonusBps: 13000,
  turnTierCapCents: 500000,
  turnStartDate: '2026-11-11',
  turnEndDate: '2027-02-11',
  marketplaceBonusBps: 14000,
  marketplacePromoEndDate: '2026-12-31',
  marketplaceDepositLimitCents: 200000,
  incomeTaxEnabled: true,
  iofEnabled: false,
  iofBps: 0,
  iofMaxDays: 30,
  simulationDate: '',
  incomeTaxBrackets: [
    { maxDays: 180, rateBps: 2250 },
    { maxDays: 360, rateBps: 2000 },
    { maxDays: 720, rateBps: 1750 },
    { maxDays: null, rateBps: 1500 }
  ]
});

function createId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function cents(value, centsValue) {
  if (Number.isSafeInteger(centsValue)) return centsValue;
  const number = Number(value);
  return Number.isFinite(number) ? toCents(number) : 0;
}

function withMetadata(entity, prefix, index) {
  const source = entity && typeof entity === 'object' && !Array.isArray(entity) ? entity : {};
  const now = new Date().toISOString();
  return {
    ...source,
    id: source.id === undefined || source.id === null || source.id === ''
      ? createId(prefix)
      : String(source.id),
    createdAt: source.createdAt || now,
    updatedAt: source.updatedAt || now,
    deletedAt: source.deletedAt || null,
    version: Number.isInteger(source.version) && source.version > 0 ? source.version : 1,
    order: Number.isInteger(source.order) ? source.order : index
  };
}

function normalizeTransaction(transaction, index) {
  transaction = transaction && typeof transaction === 'object' ? transaction : {};
  const normalized = withMetadata(transaction, 'transaction', index);
  const valueCents = cents(transaction.value, transaction.valueCents);
  return {
    ...normalized,
    valueCents,
    value: valueCents / 100,
    date: transaction.date || '',
    status: ['paid', 'pending', 'scheduled'].includes(transaction.status)
      ? transaction.status
      : 'paid'
  };
}

function normalizeCoffer(coffer, index) {
  coffer = coffer && typeof coffer === 'object' ? coffer : {};
  const normalized = withMetadata(coffer, 'coffer', index);
  return {
    ...normalized,
    active: coffer.active !== false,
    principalCents: cents(coffer.principal, coffer.principalCents),
    yieldCents: cents(coffer.yield, coffer.yieldCents),
    goalCents: cents(coffer.goal, coffer.goalCents),
    monthlyDepositGoalCents: cents(coffer.monthlyDepositGoal, coffer.monthlyDepositGoalCents)
  };
}

function normalizeCreditCard(card, index) {
  card = card && typeof card === 'object' ? card : {};
  const normalized = withMetadata(card, 'credit-card', index);
  return {
    ...normalized,
    name: typeof card.name === 'string' ? card.name : '',
    icon: typeof card.icon === 'string' ? card.icon : '💳',
    color: /^#[0-9a-f]{6}$/i.test(card.color || '') ? card.color : '#2563eb',
    limitCents: cents(card.limit, card.limitCents),
    closingDay: Number.isInteger(card.closingDay) ? card.closingDay : 1,
    dueDay: Number.isInteger(card.dueDay) ? card.dueDay : 10,
    active: card.active !== false
  };
}

function normalizeCreditInstallment(item, index) {
  item = item && typeof item === 'object' ? item : {};
  const normalized = withMetadata(item, 'credit-installment', index);
  const amountCents = cents(item.amount, item.amountCents);
  const paidCents = cents(item.paid, item.paidCents);
  return {
    ...normalized,
    cardId: String(item.cardId || ''),
    purchaseId: String(item.purchaseId || ''),
    invoiceId: String(item.invoiceId || ''),
    purchaseDate: item.purchaseDate || '',
    invoiceMonth: item.invoiceMonth || '',
    installmentNumber: Number.isInteger(item.installmentNumber) ? item.installmentNumber : 1,
    installmentCount: Number.isInteger(item.installmentCount) ? item.installmentCount : 1,
    amountCents,
    paidCents,
    status: ['open', 'partial', 'paid'].includes(item.status)
      ? item.status
      : paidCents >= amountCents ? 'paid' : paidCents > 0 ? 'partial' : 'open'
  };
}

function normalizeCreditInvoice(invoice, index) {
  invoice = invoice && typeof invoice === 'object' ? invoice : {};
  const normalized = withMetadata(invoice, 'credit-invoice', index);
  return {
    ...normalized,
    cardId: String(invoice.cardId || ''),
    invoiceMonth: invoice.invoiceMonth || '',
    closingDate: invoice.closingDate || '',
    dueDate: invoice.dueDate || '',
    installmentIds: Array.isArray(invoice.installmentIds)
      ? invoice.installmentIds.map(String)
      : [],
    totalCents: cents(invoice.total, invoice.totalCents),
    paidCents: cents(invoice.paid, invoice.paidCents),
    status: ['open', 'closed', 'paid'].includes(invoice.status) ? invoice.status : 'open'
  };
}

function normalizeCategory(category, index) {
  category = category && typeof category === 'object' ? category : {};
  const normalized = withMetadata(category, 'category', index);
  const limitCents = cents(category.limit, category.limitCents);
  return { ...normalized, limitCents, limit: limitCents / 100 };
}

function normalizeGoal(goal, index) {
  goal = goal && typeof goal === 'object' ? goal : {};
  const normalized = withMetadata(goal, 'goal', index);
  const targetCents = cents(goal.targetValue, goal.targetCents);
  return {
    ...normalized,
    targetCents,
    targetValue: targetCents / 100,
    color: /^#[0-9a-f]{6}$/i.test(goal.color || '') ? goal.color : '#38bdf8'
  };
}

function normalizeSavingsGoal(goal, index) {
  goal = goal && typeof goal === 'object' ? goal : {};
  const normalized = withMetadata(goal, 'savings-goal', index);
  const monthlyGoalCents = cents(goal.monthlyGoal, goal.monthlyGoalCents);
  return { ...normalized, monthlyGoalCents, monthlyGoal: monthlyGoalCents / 100 };
}

export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    transactions: [],
    categories: [],
    fixedExpenses: [],
    initialBalances: [],
    goals: [],
    savingsGoals: [],
    scenarios: [],
    coffers: [],
    creditCards: [],
    creditInvoices: [],
    creditInstallments: [],
    cofferSettings: { ...DEFAULT_COFFER_SETTINGS },
    fxRates: [],
    notifications: [],
    deletedItems: [],
    sort: { key: 'date', order: 'desc' },
    pagination: { page: 1, pageSize: 10 },
    filters: { year: 'all', month: 'all', type: 'all', search: '', category: 'all' },
    reportYear: 'all',
    settings: {
      currency: 'BRL',
      baseCurrency: 'BRL',
      theme: 'light',
      themeMode: 'dark',
      language: 'pt-BR',
      notifications: true,
      notificationsEnabled: true,
      notifyOnLimitReached: 80,
      annualInflationBps: 0,
      colors: {
        background: '#0b1120',
        header: '#111827',
        card: '#111827',
        accent: '#38bdf8'
      }
    }
  };
}

export function migrateState(raw, sidecar = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw.state && typeof raw.state === 'object' ? raw.state : raw)
    : {};
  const state = createEmptyState();

  const legacyTransactions = Array.isArray(source.transactions) ? source.transactions : [];
  const legacyInitialBalances = Array.isArray(source.initialBalances) ? [...source.initialBalances] : [];
  const migratedTransactions = [];

  for (const transaction of legacyTransactions) {
    const isLegacyInitialBalance = transaction?.category === 'Saldo inicial'
      || transaction?.subcategory === 'Saldo inicial'
      || transaction?.description === 'Saldo inicial';
    if (isLegacyInitialBalance && legacyInitialBalances.length === 0) {
      legacyInitialBalances.push({
        id: transaction.id,
        date: transaction.date,
        value: transaction.value,
        valueCents: transaction.valueCents,
        description: transaction.description || 'Saldo inicial'
      });
    } else if (!isLegacyInitialBalance) {
      migratedTransactions.push(transaction);
    }
  }

  state.transactions = migratedTransactions.map(normalizeTransaction);
  state.categories = (Array.isArray(source.categories) ? source.categories : [])
    .map(normalizeCategory);
  state.fixedExpenses = (Array.isArray(source.fixedExpenses) ? source.fixedExpenses : [])
    .map((item, index) => {
      item = item && typeof item === 'object' ? item : {};
      const normalized = withMetadata(item, 'fixed-expense', index);
      const valueCents = cents(item.value, item.valueCents);
      return {
        ...normalized,
        active: item.active === true || item.active === 'true',
        type: item.type === 'variable' ? 'variable' : 'fixed',
        valueCents,
        value: valueCents / 100
      };
    });
  state.initialBalances = legacyInitialBalances.map((item, index) => {
    item = item && typeof item === 'object' ? item : {};
    const normalized = withMetadata(item, 'initial-balance', index);
    const valueCents = cents(item.value, item.valueCents);
    return { ...normalized, valueCents, value: valueCents / 100 };
  });
  state.goals = (Array.isArray(source.goals) ? source.goals : [])
    .map(normalizeGoal);
  const savingsGoals = Array.isArray(source.savingsGoals) && source.savingsGoals.length
    ? source.savingsGoals
    : (Array.isArray(sidecar.savingsGoals) ? sidecar.savingsGoals : []);
  const scenarios = Array.isArray(source.scenarios) && source.scenarios.length
    ? source.scenarios
    : (Array.isArray(sidecar.scenarios) ? sidecar.scenarios : []);
  state.savingsGoals = savingsGoals.map(normalizeSavingsGoal);
  state.scenarios = scenarios.map((item, index) => withMetadata(item, 'scenario', index));
  state.coffers = (Array.isArray(source.coffers) ? source.coffers : [])
    .map(normalizeCoffer);
  state.creditCards = (Array.isArray(source.creditCards) ? source.creditCards : [])
    .map(normalizeCreditCard);
  state.creditInvoices = (Array.isArray(source.creditInvoices) ? source.creditInvoices : [])
    .map(normalizeCreditInvoice);
  state.creditInstallments = (Array.isArray(source.creditInstallments) ? source.creditInstallments : [])
    .map(normalizeCreditInstallment);
  state.fxRates = (Array.isArray(source.fxRates) ? source.fxRates : [])
    .map((item, index) => withMetadata(item, 'fx-rate', index));
  state.notifications = (Array.isArray(source.notifications) ? source.notifications : [])
    .map((item, index) => withMetadata(item, 'notification', index));
  state.deletedItems = (Array.isArray(source.deletedItems) ? source.deletedItems : [])
    .map((item, index) => {
      item = item && typeof item === 'object' ? item : {};
      return {
        ...withMetadata(item, 'deleted-item', index),
        data: item.data || item.item || null,
        entityId: item.entityId || item.data?.id || item.item?.id || item.id
      };
    });

  state.cofferSettings = {
    ...DEFAULT_COFFER_SETTINGS,
    ...(source.cofferSettings && typeof source.cofferSettings === 'object' ? source.cofferSettings : {})
  };
  state.cofferSettings.incomeTaxBrackets = Array.isArray(state.cofferSettings.incomeTaxBrackets)
    ? state.cofferSettings.incomeTaxBrackets
    : DEFAULT_COFFER_SETTINGS.incomeTaxBrackets.map((item) => ({ ...item }));

  state.settings = {
    ...state.settings,
    ...(source.settings && typeof source.settings === 'object' ? source.settings : {})
  };
  const baseCurrency = state.settings.baseCurrency || 'BRL';
  const displayCurrency = state.settings.currency || baseCurrency;
  if (displayCurrency !== baseCurrency && !state.fxRates.some((item) => (
    item.currency === displayCurrency
    && Number.isSafeInteger(item.rateToBaseMicros)
    && item.rateToBaseMicros > 0
    && typeof item.effectiveDate === 'string'
    && item.effectiveDate <= todayKey()
  ))) {
    state.settings.currency = baseCurrency;
  }
  state.sort = {
    ...state.sort,
    ...(source.sort && typeof source.sort === 'object' ? source.sort : {})
  };
  state.pagination = {
    ...state.pagination,
    ...(source.pagination && typeof source.pagination === 'object' ? source.pagination : {})
  };
  state.filters = {
    ...state.filters,
    ...(source.filters && typeof source.filters === 'object' ? source.filters : {})
  };
  state.reportYear = source.reportYear ?? state.reportYear;
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}
