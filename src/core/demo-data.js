import { createEmptyState, migrateState } from '../storage/schema.js';

function dateKey(offsetMonth = 0, day = 10) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offsetMonth, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function createDemoState(currentState = {}) {
  const state = createEmptyState();
  state.settings = {
    ...(currentState.settings || state.settings),
    themeMode: currentState.settings?.themeMode || 'dark',
    currency: 'BRL',
    demoMode: true
  };
  const demoCategories = [
    { id: 'moradia', name: 'Moradia', type: 'expense', icon: '🏠', subcategories: ['Contas', 'Residência'], limitCents: 200000, preset: true },
    { id: 'alimentacao', name: 'Alimentação', type: 'expense', icon: '🍽️', subcategories: ['Mercado', 'Refeições'], limitCents: 80000, preset: true },
    { id: 'salario', name: 'Renda', type: 'income', icon: '💼', subcategories: ['Receita'], limitCents: 0, preset: true },
    { id: 'lazer', name: 'Lazer', type: 'expense', icon: '🎬', subcategories: ['Compra parcelada'], limitCents: 40000, preset: true }
  ];
  state.categories = currentState.categories?.length
    ? currentState.categories.filter((item) => item.preset)
    : demoCategories;
  state.initialBalances = [{
    id: 'demo-initial',
    valueCents: 350000,
    date: dateKey(-1, 1),
    description: 'Saldo inicial de demonstração',
    createdAt: new Date().toISOString()
  }];
  state.transactions = [
    {
      id: 'demo-income',
      date: dateKey(0, 5),
      type: 'income',
      status: 'paid',
      category: 'salario',
      subcategory: 'Receita',
      valueCents: 520000,
      description: 'Receita mensal de demonstração',
      payment: 'Conta',
      accountImpactCents: 520000,
      affectsAccountBalance: true,
      sourceType: 'demo'
    },
    {
      id: 'demo-market',
      date: dateKey(0, 8),
      type: 'expense',
      status: 'paid',
      category: 'alimentacao',
      subcategory: 'Mercado',
      valueCents: 78000,
      description: 'Mercado do mês',
      payment: 'Conta',
      accountImpactCents: -78000,
      affectsAccountBalance: true,
      sourceType: 'demo'
    },
    {
      id: 'demo-purchase',
      date: dateKey(0, 12),
      type: 'expense',
      status: 'pending',
      category: 'lazer',
      subcategory: 'Compra parcelada',
      valueCents: 120000,
      description: 'Compra de demonstração',
      payment: 'Cartão',
      creditCardId: 'demo-card',
      sourceType: 'creditPurchase',
      installmentCount: 3,
      accountImpactCents: 0,
      affectsAccountBalance: false
    }
  ];
  state.fixedExpenses = [{
    id: 'demo-fixed',
    description: 'Conta recorrente de demonstração',
    category: 'moradia',
    valueCents: 180000,
    day: 15,
    type: 'fixed',
    duration: null,
    active: true
  }];
  state.creditCards = [{
    id: 'demo-card',
    name: 'Cartão de demonstração',
    icon: '💳',
    color: '#2563eb',
    limitCents: 500000,
    closingDay: 20,
    dueDay: 5,
    active: true
  }];
  const now = new Date();
  const invoiceYear = now.getFullYear();
  const invoiceMonth = now.getMonth() + 1;
  const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  const installments = [0, 1, 2].map((index) => {
    const absolute = invoiceMonth + index;
    const year = invoiceYear + Math.floor((absolute - 1) / 12);
    const month = ((absolute - 1) % 12) + 1;
    return {
      id: `demo-installment-${index + 1}`,
      cardId: 'demo-card',
      purchaseId: 'demo-purchase',
      invoiceId: `demo-card:${monthKey(year, month)}`,
      purchaseDate: dateKey(0, 12),
      invoiceMonth: monthKey(year, month),
      installmentNumber: index + 1,
      installmentCount: 3,
      amountCents: 40000,
      paidCents: 0,
      status: 'open'
    };
  });
  state.creditInstallments = installments;
  state.creditInvoices = [...new Set(installments.map((item) => item.invoiceMonth))].map((invoiceMonth) => ({
    id: `demo-card:${invoiceMonth}`,
    cardId: 'demo-card',
    invoiceMonth,
    closingDate: `${invoiceMonth}-20`,
    dueDate: `${invoiceMonth}-05`,
    installmentIds: installments.filter((item) => item.invoiceMonth === invoiceMonth).map((item) => item.id),
    totalCents: installments.filter((item) => item.invoiceMonth === invoiceMonth).reduce((sum, item) => sum + item.amountCents, 0),
    paidCents: 0,
    status: 'open'
  }));
  state.coffers = [{
    id: 'demo-emergency',
    name: 'Reserva de segurança',
    icon: '🛡️',
    type: 'common',
    active: true,
    paymentEnabled: false,
    allowWithdrawalWithoutYieldLoss: true,
    principalCents: 250000,
    yieldCents: 1250,
    goalCents: 600000,
    monthlyDepositGoalCents: 25000,
    depositLimitCents: null,
    bonusCdiBps: 10000,
    bonusCapCents: null,
    excessCdiBps: 10000,
    monthlyRateBps: null,
    promoStartDate: null,
    promoEndDate: null,
    promoAfter: 'standard',
    accrualMode: 'business'
  }];
  state.goals = [{
    id: 'demo-goal',
    name: 'Reserva de emergência',
    targetCents: 600000,
    targetValue: 6000,
    color: '#38bdf8',
    visible: true
  }];
  state.reportYear = nowYearMonth().year;
  return migrateState(state);
}

function nowYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
