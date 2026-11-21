import { describe, expect, it } from 'vitest';
import {
  calculateRealizedBalance,
  calculatePeriodTotals,
  calculatePreviousPeriodBalance,
  calculateFilteredOpeningBalance,
  calculateDailyExpenseAverage,
  calculateSavingsRate
} from '../src/core/finance.js';
import {
  isFixedExpenseActiveInMonth,
  createFixedExpenseOccurrence,
  createMissingFixedExpenseOccurrences,
  resolveFixedExpenseStartMonth
} from '../src/core/fixed-expenses.js';
import { migrateState, createEmptyState } from '../src/storage/schema.js';
import { validateStateShape } from '../src/core/validation.js';
import {
  changeDisplayCurrency,
  convertBaseCentsToDisplayAmount,
  convertDisplayAmountToBaseCents
} from '../src/core/currency.js';
import { closeMobileNavigation } from '../src/ui/navigation.js';
import {
  evaluatePurchaseDecision,
  summarizeFinancialPosition,
  simulateLongTermSavings,
  summarizeMonthlyBudget
} from '../src/core/planning.js';

describe('LuminaFin financial rules', () => {
  it('1. salário do mês não entra duas vezes no saldo anterior', () => {
    const transactions = [
      { date: '2026-05-01', type: 'income', status: 'paid', valueCents: 500000 }
    ];
    expect(calculatePreviousPeriodBalance(transactions, 100000, 2026, 6)).toBe(600000);
  });

  it('2. pending não entra no saldo realizado', () => {
    expect(calculateRealizedBalance([
      { date: '2026-01-01', type: 'income', status: 'pending', valueCents: 100000 }
    ], 50000)).toBe(50000);
  });

  it('3. scheduled não entra no saldo realizado', () => {
    expect(calculateRealizedBalance([
      { date: '2026-01-01', type: 'expense', status: 'scheduled', valueCents: 100000 }
    ], 50000)).toBe(50000);
  });

  it('4. gasto fixo ativo gera uma ocorrência por mês', () => {
    const expense = { id: 'fixed-1', active: true, type: 'fixed', day: 10, category: 'moradia', description: 'Aluguel', valueCents: 120000 };
    const date = new Date(2026, 4, 1);
    const first = createMissingFixedExpenseOccurrences([expense], [], date, () => 'tx-1', '2026-05-31');
    const second = createMissingFixedExpenseOccurrences([expense], first, date, () => 'tx-2', '2026-05-31');
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe('pending');
    expect(first[0].sourceMonth).toBe('2026-05');
    expect(second).toHaveLength(0);
  });

  it('5. parcelado encerra após a duração', () => {
    const expense = { active: true, type: 'variable', startMonth: '2026-01', duration: 6 };
    expect(isFixedExpenseActiveInMonth(expense, new Date(2026, 5, 1))).toBe(true);
    expect(isFixedExpenseActiveInMonth(expense, new Date(2026, 6, 1))).toBe(false);
  });

  it('6. editar parcelado preserva startMonth', () => {
    const state = migrateState({ fixedExpenses: [{ id: 'fixed-1', active: true, type: 'variable', startMonth: '2026-01', duration: 6, value: 100, day: 1, description: 'Curso', category: 'educacao' }] });
    const existing = state.fixedExpenses[0];
    expect(resolveFixedExpenseStartMonth('variable', existing, new Date(2026, 6, 1))).toBe('2026-01');
    expect(resolveFixedExpenseStartMonth('fixed', existing, new Date(2026, 6, 1))).toBe(null);
  });

  it('creates future fixed expenses as scheduled and does not duplicate earlier months', () => {
    const expense = { id: 'fixed-next', active: true, type: 'fixed', day: 10, valueCents: 1500 };
    const occurrence = createFixedExpenseOccurrence(expense, new Date(2026, 6, 1), () => 'scheduled-1', '2026-06-30');
    expect(occurrence.date).toBe('2026-07-10');
    expect(occurrence.status).toBe('scheduled');
  });

  it('7. backup central restaura cenários, metas e lixeira', () => {
    const state = migrateState(createEmptyState(), {
      scenarios: [{ name: 'Compra' }],
      savingsGoals: [{ monthlyGoal: 500 }]
    });
    state.deletedItems = [{ id: 'trash-1', type: 'transaction' }];
    state.goals = [{ id: 'goal-1', targetValue: 10000 }];
    expect(state.scenarios).toHaveLength(1);
    expect(state.savingsGoals).toHaveLength(1);
    expect(state.deletedItems).toHaveLength(1);
    expect(state.goals).toHaveLength(1);
  });

  it('8. JSON inválido não substitui estado válido', () => {
    const invalid = { categories: [], transactions: [{ id: 'tx', date: 'bad', type: 'expense', status: 'paid', valueCents: -1 }] };
    expect(validateStateShape(invalid).length).toBeGreaterThan(0);
  });

  it('9. navegação mobile fecha ao selecionar página', () => {
    let classes = new Set(['menu-open']);
    const documentRef = {
      body: { classList: { contains: (name) => classes.has(name), remove: (name) => classes.delete(name) } },
      getElementById: () => ({ setAttribute: () => {} })
    };
    expect(closeMobileNavigation(documentRef, { innerWidth: 390 })).toBe(true);
    expect(classes.has('menu-open')).toBe(false);
  });

  it('10. troca de moeda não altera valores nem taxas históricas', () => {
    const state = migrateState({
      settings: { currency: 'BRL', baseCurrency: 'BRL' },
      fxRates: [{
        id: 'fx-usd',
        currency: 'USD',
        effectiveDate: '2026-03-01',
        rateToBaseMicros: 5200000
      }],
      transactions: [{ date: '2026-03-02', type: 'expense', status: 'paid', value: 52, valueCents: 5200 }]
    });
    const changed = changeDisplayCurrency(state, 'USD', '2026-03-02');
    expect(changed.transactions).toEqual(state.transactions);
    expect(changed.settings.currency).toBe('USD');
    expect(changed.settings.currency).not.toBe(state.settings.currency);
    expect(changed.fxRates).toEqual(state.fxRates);
  });

  it('converte valores explicitamente com taxa datada e não usa taxas estáticas', () => {
    const rates = [{ currency: 'USD', effectiveDate: '2026-03-01', rateToBaseMicros: 5200000 }];
    expect(convertDisplayAmountToBaseCents(10, 'USD', rates, '2026-03-02')).toBe(5200);
    expect(convertBaseCentsToDisplayAmount(5200, 'USD', rates, '2026-03-02')).toBe(10);
    expect(convertDisplayAmountToBaseCents(10, 'USD', [], '2026-03-02')).toBe(null);
  });

  it('média diária usa todos os dias reais do mês', () => {
    expect(calculateDailyExpenseAverage([
      { date: '2026-05-01', type: 'expense', status: 'paid', valueCents: 3100 }
    ], 2026, 5)).toBe(100);
  });

  it('taxa de economia aceita resultado negativo', () => {
    expect(calculateSavingsRate(100000, 130000)).toBe(-30);
  });

  it('calcula saldo anterior para filtros agregados usando o primeiro mês representado', () => {
    const transactions = [
      { date: '2026-04-25', type: 'income', status: 'paid', valueCents: 100000 },
      { date: '2026-05-01', type: 'income', status: 'paid', valueCents: 500000 }
    ];
    const initialBalances = [{ date: '2026-05-10', valueCents: 25000 }];

    expect(calculateFilteredOpeningBalance(transactions, initialBalances, null, 5)).toBe(100000);
    expect(calculateFilteredOpeningBalance(transactions, initialBalances)).toBe(0);
  });

  it('rejects imported scenarios with broken category references', () => {
    const state = migrateState({
      categories: [],
      scenarios: [{
        id: 'scenario-1',
        name: 'Cenário inválido',
        description: '',
        date: '2026-03-01T12:00:00.000Z',
        data: {
          categories: [],
          transactions: [{
            id: 'scenario-tx-1',
            date: '2026-03-01',
            type: 'expense',
            status: 'paid',
            valueCents: 1000,
            category: 'missing-category'
          }],
          fixedExpenses: [],
          settings: {}
        }
      }]
    });

    expect(validateStateShape(state).some((issue) => /cenário.*categoria/i.test(issue))).toBe(true);
  });

  it('reserva boletos, agendamentos e gastos fixos sem ocorrência no orçamento do mês', () => {
    const position = summarizeMonthlyBudget({
      transactions: [
        { date: '2026-11-02', type: 'income', status: 'paid', valueCents: 300000 },
        { date: '2026-11-03', type: 'expense', status: 'paid', valueCents: 50000 },
        { date: '2026-11-10', type: 'income', status: 'pending', valueCents: 100000 },
        { date: '2026-11-15', type: 'expense', status: 'pending', valueCents: 40000 },
        { date: '2026-11-20', type: 'expense', status: 'scheduled', valueCents: 20000 }
      ],
      fixedExpenses: [{
        id: 'rent',
        active: true,
        type: 'fixed',
        day: 28,
        valueCents: 60000
      }],
      year: 2026,
      month: 11
    });

    expect(position).toMatchObject({
      paidIncomeCents: 300000,
      paidExpenseCents: 50000,
      pendingExpenseCents: 40000,
      scheduledExpenseCents: 20000,
      ungeneratedFixedExpenseCents: 60000,
      pendingIncomeCents: 100000,
      safeRemainingCents: 130000
    });
  });

  it('treats a paid coffer deposit as a transfer, not consumption or lost net worth', () => {
    const transactions = [{
      id: 'deposit-1',
      date: '2026-11-10',
      type: 'transfer',
      status: 'paid',
      valueCents: 10000,
      cofferId: 'reserve',
      cofferOperation: 'deposit',
      cofferPrincipalDeltaCents: 10000,
      accountImpactCents: -10000,
      affectsAccountBalance: true
    }];
    const position = summarizeFinancialPosition({
      transactions,
      initialBalances: [{ date: '2026-11-01', valueCents: 100000 }],
      coffers: [{ id: 'reserve', principalCents: 0, yieldCents: 0 }]
    });

    expect(position).toMatchObject({
      accountCents: 90000,
      cofferCents: 10000,
      netWorthCents: 100000
    });
    expect(calculatePeriodTotals(transactions, 2026, 11)).toEqual({
      incomeCents: 0,
      expenseCents: 0
    });
  });

  it('inclui parcelas da fatura e gastos fixos nas despesas comprometidas', () => {
    const position = summarizeMonthlyBudget({
      transactions: [
        { date: '2026-11-02', type: 'income', status: 'paid', valueCents: 500000 }
      ],
      fixedExpenses: [{
        id: 'rent-1',
        active: true,
        type: 'fixed',
        day: 5,
        valueCents: 100000
      }],
      creditInstallments: [{
        invoiceMonth: '2026-11',
        amountCents: 80000,
        paidCents: 20000,
        installmentCount: 3
      }, {
        invoiceMonth: '2026-11',
        amountCents: 10000,
        paidCents: 0,
        installmentCount: 1
      }, {
        invoiceMonth: '2026-12',
        amountCents: 15000,
        paidCents: 0,
        installmentCount: 3
      }],
      year: 2026,
      month: 11
    });

    expect(position).toMatchObject({
      ungeneratedFixedExpenseCents: 100000,
      creditInvoiceCents: 70000,
      installmentCreditCents: 60000,
      singlePaymentCreditCents: 10000,
      nextCreditInvoiceCents: 15000,
      creditInvoiceTrendCents: -55000,
      committedExpenseCents: 170000,
      safeRemainingCents: 330000
    });
  });

  it('migrates missing descriptions and card links as optional transaction fields', () => {
    const migrated = migrateState({
      transactions: [{
        id: 'transaction-optional',
        date: '2026-11-01',
        type: 'expense',
        status: 'paid',
        value: 12.5
      }]
    });

    expect(migrated.transactions[0].description).toBe('');
    expect(migrated.transactions[0].creditCardId).toBeUndefined();
    expect(validateStateShape(migrated)).toEqual([]);
  });

  it('simula horizonte longo em centavos e desconta inflação do valor nominal', () => {
    const projection = simulateLongTermSavings({
      initialCents: 100000,
      monthlyContributionCents: 10000,
      annualReturnBps: 0,
      annualInflationBps: 1000,
      years: 1
    });

    expect(projection.finalNominalCents).toBe(220000);
    expect(projection.finalRealCents).toBe(200000);
    expect(projection.totalContributionsCents).toBe(220000);
    expect(projection.points).toHaveLength(1);
  });

  it('sugere resgate de cofrinho e expõe perda proporcional configurável', () => {
    const monthlyPosition = {
      paidIncomeCents: 0,
      safeRemainingCents: -10000,
      pendingIncomeCents: 0,
      pendingExpenseCents: 0,
      scheduledIncomeCents: 0,
      scheduledExpenseCents: 0,
      ungeneratedFixedExpenseCents: 0,
      creditInvoiceCents: 5000
    };
    const decision = evaluatePurchaseDecision({
      amountCents: 50000,
      installments: 1,
      accountBalanceCents: 20000,
      monthlyPosition,
      coffers: [{
        id: 'custom-1',
        name: 'Cofrinho configurável',
        type: 'marketplace',
        active: true,
        principalCents: 90000,
        yieldCents: 10000,
        monthlyRateBps: 100,
        createdAt: '2026-01-01T00:00:00.000Z'
      }],
      transactions: []
    });

    expect(decision.verdict).toBe('tight');
    expect(decision.cashShortfallCents).toBe(35000);
    expect(decision.reserveCents).toBe(100000);
    expect(decision.reserveMonthlyYieldCents).toBe(1000);
    expect(decision.immediateCapacityCents).toBe(15000);
    expect(decision.suggestedCoffer.yieldLossCents).toBeGreaterThan(0);
    expect(decision.suggestedCoffer.netReceivedCents).toBeGreaterThanOrEqual(30000);
  });

  it('não trata receita pendente ou estimada como dinheiro seguro para a compra', () => {
    const decision = evaluatePurchaseDecision({
      amountCents: 50000,
      installments: 1,
      accountBalanceCents: 60000,
      monthlyPosition: {
        paidIncomeCents: 0,
        safeRemainingCents: 0,
        pendingIncomeCents: 100000,
        pendingExpenseCents: 80000,
        scheduledIncomeCents: 0,
        scheduledExpenseCents: 0,
        ungeneratedFixedExpenseCents: 0,
        estimatedIncomeCents: 100000,
        estimatedExpenseCents: 0
      },
      coffers: [],
      transactions: []
    });

    expect(decision.cashShortfallCents).toBe(70000);
    expect(decision.verdict).toBe('not-affordable');
  });
});
