import { DEFAULT_COFFER_SETTINGS } from '../storage/schema.js';
import { normalizeDate } from './finance.js';

const COLLECTIONS = [
  'categories',
  'transactions',
  'fixedExpenses',
  'initialBalances',
  'goals',
  'savingsGoals',
  'scenarios',
  'coffers',
  'creditCards',
  'creditInvoices',
  'creditInstallments',
  'fxRates',
  'notifications',
  'deletedItems'
];

const COFFER_TYPES = new Set(['common']);
const COFFER_OPERATIONS = new Set(['opening', 'deposit', 'withdrawal', 'purchase', 'yield']);
const TRANSACTION_STATUSES = new Set(['paid', 'pending', 'scheduled']);

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isText(value, maxLength = 100) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength
    && !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31);
    });
}

function validDate(value) {
  return Boolean(normalizeDate(value));
}

function validCofferSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const numericKeys = [
    'annualCdiBps',
    'businessDaysPerYear',
    'commonBaseBps',
    'commonBonusBps',
    'commonTierCapCents',
    'iofBps',
    'iofMaxDays'
  ];
  if (!numericKeys.every((key) => Number.isSafeInteger(settings[key]) && settings[key] >= 0)) return false;
  if (settings.annualCdiBps > 100000 || settings.businessDaysPerYear < 1 || settings.businessDaysPerYear > 366) return false;
  if (typeof settings.incomeTaxEnabled !== 'boolean' || typeof settings.iofEnabled !== 'boolean') return false;
  if (typeof settings.commonRequiresMonthlyGoal !== 'boolean') return false;
  if (settings.simulationDate !== '' && !validDate(settings.simulationDate)) return false;
  if (!Array.isArray(settings.incomeTaxBrackets) || settings.incomeTaxBrackets.length === 0) return false;
  return settings.incomeTaxBrackets.every((bracket, index) => (
    bracket
    && (bracket.maxDays === null || (Number.isInteger(bracket.maxDays) && bracket.maxDays > 0))
    && Number.isInteger(bracket.rateBps)
    && bracket.rateBps >= 0
    && bracket.rateBps <= 10000
    && (index === 0 || settings.incomeTaxBrackets[index - 1].maxDays !== null)
  ));
}

export function validateStateShape(state) {
  const issues = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['Estado não é um objeto'];

  for (const name of COLLECTIONS) {
    if (!Array.isArray(state[name])) issues.push(`${name} deve ser uma lista`);
  }
  if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) {
    issues.push('settings deve ser um objeto');
  }
  if (!validCofferSettings(state.cofferSettings)) issues.push('cofferSettings inválido ou incompleto');

  const ids = new Set();
  for (const name of COLLECTIONS) {
    const collection = state[name];
    if (!Array.isArray(collection)) continue;
    for (const entity of collection) {
      if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
        issues.push(`${name} contém entrada inválida`);
        continue;
      }
      if (!isText(entity.id, 128)) {
        issues.push(`${name} contém item sem ID válido`);
      } else if (ids.has(entity.id)) {
        issues.push(`ID duplicado: ${entity.id}`);
      } else {
        ids.add(entity.id);
      }
      if (typeof entity.createdAt !== 'string' || Number.isNaN(Date.parse(entity.createdAt))) {
        issues.push(`createdAt inválido em ${name} (${entity.id || ''})`);
      }
      if (typeof entity.updatedAt !== 'string' || Number.isNaN(Date.parse(entity.updatedAt))) {
        issues.push(`updatedAt inválido em ${name} (${entity.id || ''})`);
      }
      if (entity.deletedAt !== null && entity.deletedAt !== undefined
        && (typeof entity.deletedAt !== 'string' || Number.isNaN(Date.parse(entity.deletedAt)))) {
        issues.push(`deletedAt inválido em ${name} (${entity.id || ''})`);
      }
      if (!Number.isInteger(entity.version) || entity.version < 1) {
        issues.push(`version inválida em ${name} (${entity.id || ''})`);
      }
    }
  }

  const categories = Array.isArray(state.categories) ? state.categories : [];
  const categoryIds = new Set(categories.map((item) => item?.id).filter(Boolean));
  const categoryById = new Map(categories.map((item) => [item?.id, item]));
  const cofferIds = new Set((Array.isArray(state.coffers) ? state.coffers : []).map((item) => item?.id).filter(Boolean));
  const creditCardIds = new Set((Array.isArray(state.creditCards) ? state.creditCards : []).map((item) => item?.id).filter(Boolean));
  const creditInvoiceIds = new Set((Array.isArray(state.creditInvoices) ? state.creditInvoices : []).map((item) => item?.id).filter(Boolean));
  const creditInstallments = Array.isArray(state.creditInstallments) ? state.creditInstallments : [];
  const creditInstallmentsByPurchase = new Map();
  const transactionById = new Map((Array.isArray(state.transactions) ? state.transactions : [])
    .map((transaction) => [transaction?.id, transaction]));
  const seenRates = new Set();
  for (const rate of Array.isArray(state.fxRates) ? state.fxRates : []) {
    const key = `${rate?.currency}:${rate?.effectiveDate}`;
    if (!/^[A-Z]{3}$/.test(rate?.currency || '')
      || rate.currency === (state.settings?.baseCurrency || 'BRL')
      || !validDate(rate?.effectiveDate)
      || !Number.isSafeInteger(rate?.rateToBaseMicros)
      || rate.rateToBaseMicros <= 0) {
      issues.push(`Taxa de câmbio inválida ${rate?.id || ''}`);
    }
    if (seenRates.has(key)) issues.push(`Taxa de câmbio duplicada: ${key}`);
    seenRates.add(key);
  }

  for (const category of categories) {
    if (!isText(category?.name, 60)) issues.push(`Nome inválido na categoria ${category?.id || ''}`);
    if (!isNonNegativeSafeInteger(category?.limitCents)) {
      issues.push(`Limite inválido na categoria ${category?.id || ''}`);
    }
    if (typeof category?.icon !== 'string' || Array.from(category.icon).length > 8 || /[<>]/.test(category.icon)) {
      issues.push(`Ícone inválido na categoria ${category?.id || ''}`);
    }
    if (!['income', 'expense', 'both'].includes(category?.type)) {
      issues.push(`Tipo inválido na categoria ${category?.id || ''}`);
    }
  }

  for (const goal of Array.isArray(state.goals) ? state.goals : []) {
    if (!isText(goal?.name, 100)) issues.push(`Nome inválido na meta ${goal?.id || ''}`);
    if (!isNonNegativeSafeInteger(goal?.targetCents) || goal.targetCents === 0) {
      issues.push(`Valor inválido na meta ${goal?.id || ''}`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(goal?.color || '')) issues.push(`Cor inválida na meta ${goal?.id || ''}`);
  }

  for (const goal of Array.isArray(state.savingsGoals) ? state.savingsGoals : []) {
    if (!isNonNegativeSafeInteger(goal?.monthlyGoalCents) || goal.monthlyGoalCents === 0
      || !Number.isInteger(goal?.deadline) || goal.deadline < 1 || goal.deadline > 600) {
      issues.push(`Meta de poupança inválida ${goal?.id || ''}`);
    }
  }

  for (const scenario of Array.isArray(state.scenarios) ? state.scenarios : []) {
    const data = scenario?.data;
    if (!isText(scenario?.name, 100)
      || (scenario?.description !== undefined
        && (typeof scenario.description !== 'string' || scenario.description.length > 500))
      || typeof scenario?.date !== 'string'
      || Number.isNaN(Date.parse(scenario.date))
      || !data || typeof data !== 'object' || Array.isArray(data)
      || !Array.isArray(data.categories)
      || !Array.isArray(data.transactions)
      || !Array.isArray(data.fixedExpenses)
      || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      issues.push(`Cenário inválido ${scenario?.id || ''}`);
      continue;
    }
    const snapshotCategoryIds = new Set();
    for (const category of data.categories) {
      if (!isText(category?.id, 128) || snapshotCategoryIds.has(category.id)
        || !isText(category?.name, 60)
        || !['income', 'expense', 'both'].includes(category?.type)) {
        issues.push(`Categoria inválida no cenário ${scenario.id}`);
      }
      if (category?.id) snapshotCategoryIds.add(category.id);
    }
    for (const transaction of data.transactions) {
      if (!validDate(transaction?.date)
        || !['income', 'expense', 'transfer'].includes(transaction?.type)
        || !TRANSACTION_STATUSES.has(transaction?.status)
        || (!isNonNegativeSafeInteger(transaction?.valueCents)
          && !(Number.isFinite(transaction?.value) && transaction.value > 0))) {
        issues.push(`Lançamento inválido no cenário ${scenario.id}`);
      }
      if (transaction?.category && !snapshotCategoryIds.has(transaction.category)) {
        issues.push(`Cenário ${scenario.id} referencia categoria inexistente`);
      }
    }
    for (const expense of data.fixedExpenses) {
      if (!snapshotCategoryIds.has(expense?.category)) {
        issues.push(`Gasto fixo no cenário ${scenario.id} referencia categoria inexistente`);
      }
    }
  }

  for (const transaction of Array.isArray(state.transactions) ? state.transactions : []) {
    if (!validDate(transaction?.date)) issues.push(`Data inválida na transação ${transaction?.id || ''}`);
    if (!['income', 'expense', 'transfer'].includes(transaction?.type)) {
      issues.push(`Tipo inválido na transação ${transaction?.id || ''}`);
    }
    if (!TRANSACTION_STATUSES.has(transaction?.status)) {
      issues.push(`Status inválido na transação ${transaction?.id || ''}`);
    }
    if (!isNonNegativeSafeInteger(transaction?.valueCents) || transaction.valueCents === 0) {
      issues.push(`Valor inválido na transação ${transaction?.id || ''}`);
    }
    if (transaction?.category && !categoryIds.has(transaction.category)) {
      issues.push(`Categoria inexistente na transação ${transaction.id || ''}`);
    }
    if (transaction?.sourceType === 'fixedExpense') {
      if (!isText(transaction.sourceId, 128)
        || !/^\d{4}-(0[1-9]|1[0-2])$/.test(transaction.sourceMonth || '')) {
        issues.push(`Origem de gasto fixo inválida na transação ${transaction.id || ''}`);
      }
    }
    if (transaction?.sourceType === 'creditPurchase') {
      if (!creditCardIds.has(transaction.creditCardId)
        || transaction.type !== 'expense'
        || transaction.status !== 'pending'
        || transaction.affectsAccountBalance !== false
        || !Number.isInteger(transaction.installmentCount)
        || transaction.installmentCount < 1 || transaction.installmentCount > 24) {
        issues.push(`Compra no cartão inválida ${transaction.id || ''}`);
      }
    }
    if (transaction?.sourceType === 'creditInvoicePayment') {
      if (!creditInvoiceIds.has(transaction.creditInvoiceId)
        || transaction.type !== 'transfer'
        || transaction.status !== 'paid'
        || transaction.category) {
        issues.push(`Pagamento de fatura inválido ${transaction.id || ''}`);
      }
    }
    if (transaction?.category && ['income', 'expense'].includes(transaction.type)) {
      const category = categoryById.get(transaction.category);
      if (category && category.type !== 'both' && category.type !== transaction.type) {
        issues.push(`Tipo de categoria incompatível na transação ${transaction.id || ''}`);
      }
    }
    if (transaction?.cofferOperation) {
      if (!COFFER_OPERATIONS.has(transaction.cofferOperation)) {
        issues.push(`Operação de cofrinho inválida na transação ${transaction.id || ''}`);
      }
      if (!cofferIds.has(transaction.cofferId)) {
        issues.push(`Cofrinho inexistente na transação ${transaction.id || ''}`);
      }
      if (!Number.isSafeInteger(transaction.cofferPrincipalDeltaCents)
        || !Number.isSafeInteger(transaction.cofferYieldDeltaCents)) {
        issues.push(`Vínculo de saldo do cofrinho inválido na transação ${transaction.id || ''}`);
      }
    }
    if (transaction?.accountImpactCents !== undefined
      && !Number.isSafeInteger(transaction.accountImpactCents)) {
      issues.push(`Impacto na conta inválido na transação ${transaction.id || ''}`);
    }
  }

  for (const expense of Array.isArray(state.fixedExpenses) ? state.fixedExpenses : []) {
    if (!isText(expense?.description, 120)) issues.push(`Descrição inválida no gasto fixo ${expense?.id || ''}`);
    if (!Number.isSafeInteger(expense?.valueCents) || expense.valueCents <= 0) {
      issues.push(`Valor inválido no gasto fixo ${expense?.id || ''}`);
    }
    if (!Number.isInteger(expense?.day) || expense.day < 1 || expense.day > 31) {
      issues.push(`Dia inválido no gasto fixo ${expense?.id || ''}`);
    }
    if (typeof expense?.active !== 'boolean') issues.push(`Status inválido no gasto fixo ${expense?.id || ''}`);
    if (!categoryIds.has(expense?.category)) issues.push(`Categoria inexistente no gasto fixo ${expense?.id || ''}`);
    if (expense?.type === 'variable') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(expense.startMonth || '')
        || !Number.isInteger(expense.duration) || expense.duration < 1) {
        issues.push(`Período inválido no gasto parcelado ${expense.id || ''}`);
      }
    } else if (!['fixed', 'variable'].includes(expense?.type)) {
      issues.push(`Tipo inválido no gasto fixo ${expense?.id || ''}`);
    }
  }

  for (const balance of Array.isArray(state.initialBalances) ? state.initialBalances : []) {
    if (!validDate(balance?.date) || !Number.isSafeInteger(balance?.valueCents)) {
      issues.push(`Saldo inicial inválido ${balance?.id || ''}`);
    }
  }

  for (const coffer of Array.isArray(state.coffers) ? state.coffers : []) {
    if (!isText(coffer?.name, 60)) issues.push(`Nome inválido no cofrinho ${coffer?.id || ''}`);
    if (!COFFER_TYPES.has(coffer?.type)) issues.push(`Tipo inválido no cofrinho ${coffer?.id || ''}`);
    if (typeof coffer?.icon !== 'string' || Array.from(coffer.icon).length > 8 || /[<>]/.test(coffer.icon)) {
      issues.push(`Ícone inválido no cofrinho ${coffer?.id || ''}`);
    }
    for (const key of ['principalCents', 'yieldCents', 'goalCents', 'monthlyDepositGoalCents']) {
      if (!isNonNegativeSafeInteger(coffer?.[key])) issues.push(`${key} inválido no cofrinho ${coffer?.id || ''}`);
    }
    if (typeof coffer?.active !== 'boolean' || typeof coffer?.paymentEnabled !== 'boolean') {
      issues.push(`Configuração inválida no cofrinho ${coffer?.id || ''}`);
    }
  }

  for (const card of Array.isArray(state.creditCards) ? state.creditCards : []) {
    if (!isText(card?.name, 60)) issues.push(`Nome inválido no cartão ${card?.id || ''}`);
    if (!isNonNegativeSafeInteger(card?.limitCents) || card.limitCents === 0) {
      issues.push(`Limite inválido no cartão ${card?.id || ''}`);
    }
    if (!Number.isInteger(card?.closingDay) || card.closingDay < 1 || card.closingDay > 31
      || !Number.isInteger(card?.dueDay) || card.dueDay < 1 || card.dueDay > 31) {
      issues.push(`Datas de fechamento/vencimento inválidas no cartão ${card?.id || ''}`);
    }
    if (typeof card?.active !== 'boolean') issues.push(`Status inválido no cartão ${card?.id || ''}`);
    if (typeof card?.icon !== 'string' || Array.from(card.icon).length > 8 || /[<>]/.test(card.icon)) {
      issues.push(`Ícone inválido no cartão ${card?.id || ''}`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(card?.color || '')) issues.push(`Cor inválida no cartão ${card?.id || ''}`);
  }

  const installmentsByInvoice = new Map();
  for (const installment of creditInstallments) {
    if (!creditCardIds.has(installment?.cardId)
      || !creditInvoiceIds.has(installment?.invoiceId)
      || !isText(installment?.purchaseId, 128)
      || !validDate(installment?.purchaseDate)
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(installment?.invoiceMonth || '')
      || !Number.isInteger(installment?.installmentNumber)
      || !Number.isInteger(installment?.installmentCount)
      || installment.installmentCount < 1 || installment.installmentCount > 24
      || installment.installmentNumber < 1
      || installment.installmentNumber > installment.installmentCount
      || !isNonNegativeSafeInteger(installment?.amountCents) || installment.amountCents === 0
      || !isNonNegativeSafeInteger(installment?.paidCents)
      || installment.paidCents > installment.amountCents
      || !['open', 'partial', 'paid'].includes(installment?.status)) {
      issues.push(`Parcela de cartão inválida ${installment?.id || ''}`);
    }
    const purchaseTransaction = transactionById.get(installment?.purchaseId);
    if (purchaseTransaction?.sourceType !== 'creditPurchase'
      || purchaseTransaction.creditCardId !== installment?.cardId) {
      issues.push(`Compra de origem inexistente na parcela ${installment?.id || ''}`);
    }
    if (!installmentsByInvoice.has(installment?.invoiceId)) installmentsByInvoice.set(installment.invoiceId, []);
    installmentsByInvoice.get(installment.invoiceId).push(installment);
    if (!creditInstallmentsByPurchase.has(installment?.purchaseId)) {
      creditInstallmentsByPurchase.set(installment.purchaseId, []);
    }
    creditInstallmentsByPurchase.get(installment.purchaseId).push(installment);
  }

  for (const transaction of Array.isArray(state.transactions) ? state.transactions : []) {
    if (transaction?.sourceType !== 'creditPurchase') continue;
    const installments = creditInstallmentsByPurchase.get(transaction.id) || [];
    const totalCents = installments.reduce((sum, item) => sum + item.amountCents, 0);
    if (installments.length !== transaction.installmentCount || totalCents !== transaction.valueCents) {
      issues.push(`Parcelamento não corresponde à compra ${transaction.id}`);
    }
    const installmentNumbers = new Set(installments.map((item) => item.installmentNumber));
    if (installmentNumbers.size !== installments.length) {
      issues.push(`Número de parcela duplicado na compra ${transaction.id}`);
    }
  }

  for (const invoice of Array.isArray(state.creditInvoices) ? state.creditInvoices : []) {
    if (!creditCardIds.has(invoice?.cardId)
      || !/^\d{4}-(0[1-9]|1[0-2])$/.test(invoice?.invoiceMonth || '')
      || !validDate(invoice?.closingDate) || !validDate(invoice?.dueDate)
      || !isNonNegativeSafeInteger(invoice?.totalCents)
      || !isNonNegativeSafeInteger(invoice?.paidCents)
      || invoice.paidCents > invoice.totalCents
      || !['open', 'closed', 'paid'].includes(invoice?.status)
      || !Array.isArray(invoice?.installmentIds)) {
      issues.push(`Fatura inválida ${invoice?.id || ''}`);
      continue;
    }
    const invoiceItems = installmentsByInvoice.get(invoice.id) || [];
    const listedIds = new Set(invoice.installmentIds);
    const listedTotalCents = invoiceItems.reduce((sum, item) => sum + item.amountCents, 0);
    const listedPaidCents = invoiceItems.reduce((sum, item) => sum + item.paidCents, 0);
    if (listedIds.size !== invoice.installmentIds.length
      || invoiceItems.some((item) => item.cardId !== invoice.cardId || item.invoiceMonth !== invoice.invoiceMonth
        || !listedIds.has(item.id))
      || listedTotalCents !== invoice.totalCents
      || listedPaidCents !== invoice.paidCents) {
      issues.push(`Parcelas não correspondem à fatura ${invoice.id}`);
    }
  }

  for (const settings of [state.settings]) {
    if (!settings || typeof settings !== 'object') continue;
    if (typeof settings.currency !== 'string' || !/^[A-Z]{3}$/.test(settings.currency)) {
      issues.push('Moeda inválida nas configurações');
    }
    if (typeof settings.baseCurrency !== 'string' || !/^[A-Z]{3}$/.test(settings.baseCurrency)) {
      issues.push('Moeda base inválida nas configurações');
    }
    if (settings.currency !== settings.baseCurrency
      && !state.fxRates.some((rate) => rate.currency === settings.currency
        && validDate(rate.effectiveDate)
        && rate.effectiveDate <= new Date().toISOString().slice(0, 10)
        && Number.isSafeInteger(rate.rateToBaseMicros)
        && rate.rateToBaseMicros > 0)) {
      issues.push('A moeda de exibição não tem uma taxa registrada vigente');
    }
    if (!['light', 'dark', 'system'].includes(settings.theme)) issues.push('Tema inválido nas configurações');
    if (settings.annualInflationBps !== undefined
      && (!Number.isInteger(settings.annualInflationBps) || settings.annualInflationBps < 0
        || settings.annualInflationBps > 10000)) {
      issues.push('Inflação anual inválida nas configurações');
    }
  }

  for (const item of Array.isArray(state.deletedItems) ? state.deletedItems : []) {
    if (!isText(item?.type, 40) || !item?.data || typeof item.data !== 'object') {
      issues.push(`Item inválido na lixeira ${item?.id || ''}`);
    }
  }

  if (!state.missions || typeof state.missions !== 'object'
    || !Array.isArray(state.missions.completedIds)
    || typeof state.missions.dismissed !== 'boolean'
    || typeof state.missions.minimized !== 'boolean') {
    issues.push('Estado de missões inválido');
  }

  return issues;
}

export function validateCofferSettings(settings) {
  return validCofferSettings({ ...DEFAULT_COFFER_SETTINGS, ...settings });
}
