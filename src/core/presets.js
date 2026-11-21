export const COFFER_PRESETS = Object.freeze({
  security: Object.freeze({
    name: 'Reserva de segurança',
    icon: '🛡️',
    goal: 12000,
    monthly: 500,
    bonusCdi: 100,
    bonusCap: '',
    excessCdi: 100,
    paymentEnabled: false,
    allowLoss: true,
    accrualMode: 'calendar'
  }),
  medium: Object.freeze({
    name: 'Meta de médio prazo',
    icon: '🎯',
    goal: 6000,
    monthly: 300,
    bonusCdi: 110,
    bonusCap: '',
    excessCdi: 100,
    paymentEnabled: false,
    allowLoss: true,
    accrualMode: 'calendar'
  }),
  tier: Object.freeze({
    name: 'Cofrinho com faixa escalonada',
    icon: '📊',
    goal: 10000,
    monthly: '',
    bonusCdi: 115,
    bonusCap: 5000,
    excessCdi: 100,
    paymentEnabled: false,
    allowLoss: true,
    accrualMode: 'business'
  }),
  purchase: Object.freeze({
    name: 'Cofrinho dedicado a compras',
    icon: '🛍️',
    goal: 3000,
    monthly: 250,
    bonusCdi: 100,
    bonusCap: '',
    excessCdi: 100,
    paymentEnabled: true,
    allowLoss: false,
    accrualMode: 'calendar'
  })
});

export const TRANSACTION_PRESETS = Object.freeze({
  housing: Object.freeze({ type: 'expense', category: 'moradia', subcategory: 'Contas', payment: 'Conta / outro', status: 'pending', method: 'account', description: 'Despesa de moradia' }),
  market: Object.freeze({ type: 'expense', category: 'alimentacao', subcategory: 'Mercado', payment: 'Conta / outro', status: 'pending', method: 'account', description: 'Compra de mercado' }),
  salary: Object.freeze({ type: 'income', category: 'salario', subcategory: 'Receita', payment: 'Conta / outro', status: 'paid', method: 'account', description: 'Receita mensal' }),
  cashPurchase: Object.freeze({ type: 'expense', category: 'lazer', subcategory: 'Compra', payment: 'Conta / outro', status: 'pending', method: 'account', description: 'Compra à vista', installments: 1 }),
  installmentPurchase: Object.freeze({ type: 'expense', category: 'lazer', subcategory: 'Compra parcelada', payment: '', status: 'pending', method: 'creditCard', description: 'Compra parcelada', installments: 3 })
});

export const GOAL_PRESETS = Object.freeze({
  emergency: Object.freeze({ name: 'Reserva de emergência', target: 6000, color: '#38bdf8' }),
  purchase: Object.freeze({ name: 'Objetivo de compra', target: 3000, color: '#8b5cf6' }),
  future: Object.freeze({ name: 'Projeto futuro', target: 10000, color: '#22c55e' })
});
