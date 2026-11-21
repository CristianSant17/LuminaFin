import { describe, expect, it } from 'vitest';
import {
  calculateCofferBalance,
  countBusinessDays,
  createCofferOperation,
  resolveCofferTransition,
  simulateCofferYield
} from '../src/core/coffers.js';
import { DEFAULT_COFFER_SETTINGS, migrateState } from '../src/storage/schema.js';
import {
  calculatePeriodTotals,
  calculateUnsettledPeriodTotals
} from '../src/core/finance.js';
import { validateStateShape } from '../src/core/validation.js';

const makeCoffer = (id, type, principalCents, extra = {}) => ({
  id,
  type,
  name: id,
  icon: '💰',
  active: true,
  paymentEnabled: false,
  principalCents,
  yieldCents: 0,
  goalCents: 0,
  monthlyDepositGoalCents: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  campaignStartDate: '2026-11-11',
  campaignEndDate: '2027-02-11',
  ...extra
});

describe('Cofrinhos', () => {
  it('uses the shared bonus tier across common coffers', () => {
    const first = makeCoffer('common-1', 'common', 400000);
    const second = makeCoffer('common-2', 'common', 300000);
    const result = simulateCofferYield({
      coffer: second,
      coffers: [first, second],
      transactions: [],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2026-03-02',
      endDate: '2026-03-06'
    });

    expect(result.businessDays).toBe(4);
    expect(result.rangeBreakdown.promotionalCents).toBeGreaterThan(0);
    expect(result.rangeBreakdown.baseCents).toBeGreaterThan(0);
  });

  it('reports the common base tier when the prior-month deposit goal is unmet', () => {
    const coffer = makeCoffer('common-goal', 'common', 500000, {
      monthlyDepositGoalCents: 10000
    });
    const result = simulateCofferYield({
      coffer,
      coffers: [coffer],
      transactions: [],
      settings: {
        ...DEFAULT_COFFER_SETTINGS,
        annualCdiBps: 1200,
        commonRequiresMonthlyGoal: true
      },
      startDate: '2026-03-02',
      endDate: '2026-03-06'
    });

    expect(result.rangeBreakdown.promotionalCents).toBe(0);
    expect(result.rangeBreakdown.baseCents).toBeGreaterThan(0);
  });

  it('applies a promotional bonus only below its independent balance cap', () => {
    const coffer = makeCoffer('promotion-tier', 'common', 1000000, {
      promoStartDate: '2026-03-01',
      promoEndDate: '2026-03-31',
      bonusCdiBps: 13000,
      bonusCapCents: 500000,
      excessCdiBps: 10000
    });
    const result = simulateCofferYield({
      coffer,
      coffers: [coffer],
      transactions: [],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2026-03-02',
      endDate: '2026-03-06'
    });
    expect(result.rangeBreakdown.promotionalCents).toBeGreaterThan(0);
    expect(result.rangeBreakdown.baseCents).toBeGreaterThan(0);
  });

  it('keeps a custom deposit cap separate from the shared yield tier', () => {
    const coffer = makeCoffer('custom-1', 'common', 190000, { depositLimitCents: 200000 });
    expect(() => createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'deposit',
      amountCents: 10001,
      date: '2026-03-02',
      id: 'tx-limit'
    })).toThrow(/limite/i);
  });

  it('charges proportional yield loss on ordinary withdrawals, not checkout purchases', () => {
    const coffer = makeCoffer('custom-1', 'common', 900000, {
      yieldCents: 100000,
      paymentEnabled: true
    });
    const withdrawal = createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'withdrawal',
      amountCents: 100000,
      date: '2026-03-02',
      id: 'tx-withdraw'
    });
    const purchase = createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'purchase',
      amountCents: 100000,
      date: '2026-03-02',
      id: 'tx-purchase',
      category: 'shopping'
    });

    expect(withdrawal.cofferYieldLossCents).toBe(10000);
    expect(withdrawal.accountImpactCents).toBe(90000);
    expect(purchase.cofferYieldLossCents).toBe(0);
    expect(purchase.accountImpactCents).toBe(0);
    expect(purchase.type).toBe('expense');
    expect(calculateCofferBalance(coffer, [purchase]).totalCents).toBe(900000);
  });

  it('rejects checkout purchases when payments are disabled', () => {
    const coffer = makeCoffer('disabled-1', 'common', 100000);
    expect(() => createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'purchase',
      amountCents: 1000,
      date: '2026-03-02',
      id: 'tx-disabled-purchase'
    })).toThrow(/pagamentos/i);
  });

  it('transitions an active promotional coffer to standard after its campaign ends', () => {
    const coffer = makeCoffer('promotion-1', 'turn', 500000);
    const transitioned = resolveCofferTransition(coffer, [], '2027-02-12');
    expect(transitioned.type).toBe('common');
    expect(transitioned.transitionedAt).toBe('2027-02-12');
  });

  it('simulates post-campaign yield using standard coffer rules', () => {
    const coffer = makeCoffer('promotion-1', 'turn', 500000);
    const commonEquivalent = { ...coffer, type: 'common' };
    const result = simulateCofferYield({
      coffer,
      coffers: [coffer],
      transactions: [],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2027-02-12',
      endDate: '2027-02-16'
    });
    const commonResult = simulateCofferYield({
      coffer: commonEquivalent,
      coffers: [commonEquivalent],
      transactions: [],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2027-02-12',
      endDate: '2027-02-16'
    });

    expect(result.grossInterestCents).toBe(commonResult.grossInterestCents);
  });

  it('credits net simulated yield using business days and configured income tax', () => {
    const coffer = makeCoffer('common-1', 'common', 1000000);
    const result = simulateCofferYield({
      coffer,
      coffers: [coffer],
      transactions: [],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2026-03-02',
      endDate: '2026-03-06'
    });

    expect(countBusinessDays('2026-03-02', '2026-03-06')).toBe(4);
    expect(result.grossInterestCents).toBeGreaterThan(result.netInterestCents);
    expect(result.netInterestCents).toBeGreaterThan(0);
    expect(result.closingBalanceCents).toBe(1000000 + result.netInterestCents);
  });

  it('includes paid coffer movements inside the simulation period in its closing balance', () => {
    const coffer = makeCoffer('common-1', 'common', 100000);
    const deposit = createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'deposit',
      amountCents: 50000,
      date: '2026-03-04',
      id: 'tx-mid-period-deposit'
    });
    const result = simulateCofferYield({
      coffer,
      coffers: [coffer],
      transactions: [deposit],
      settings: { ...DEFAULT_COFFER_SETTINGS, annualCdiBps: 1200 },
      startDate: '2026-03-02',
      endDate: '2026-03-06'
    });

    expect(result.closingBalanceCents).toBe(150000 + result.netInterestCents);
  });

  it('keeps coffer movements linked to their source and separates account impact', () => {
    const coffer = makeCoffer('common-1', 'common', 0);
    const deposit = createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'deposit',
      amountCents: 50000,
      date: '2026-03-02',
      id: 'tx-deposit'
    });
    expect(deposit.cofferId).toBe('common-1');
    expect(deposit.cofferPrincipalDeltaCents).toBe(50000);
    expect(deposit.accountImpactCents).toBe(-50000);
  });

  it('counts linked deposits in the account balance without double-counting report expenses', () => {
    const coffer = makeCoffer('common-1', 'common', 0);
    const deposit = createCofferOperation({
      coffer,
      coffers: [coffer],
      transactions: [],
      operation: 'deposit',
      amountCents: 50000,
      date: '2026-03-02',
      id: 'tx-deposit'
    });
    expect(calculatePeriodTotals([deposit], 2026, 3)).toEqual({ incomeCents: 0, expenseCents: 0 });
    expect(calculateCofferBalance(coffer, [deposit]).principalCents).toBe(50000);
  });

  it('keeps pending and scheduled amounts outside realized report totals', () => {
    const transactions = [
      { date: '2026-03-02', type: 'income', status: 'paid', valueCents: 10000 },
      { date: '2026-03-03', type: 'expense', status: 'pending', valueCents: 2000 },
      { date: '2026-03-04', type: 'expense', status: 'scheduled', valueCents: 3000 }
    ];
    expect(calculatePeriodTotals(transactions, 2026, 3)).toEqual({
      incomeCents: 10000,
      expenseCents: 0
    });
    expect(calculateUnsettledPeriodTotals(transactions, 2026, 3)).toEqual({
      pendingIncomeCents: 0,
      pendingExpenseCents: 2000,
      scheduledIncomeCents: 0,
      scheduledExpenseCents: 3000
    });
  });

  it('migrates coffers and rejects broken references or duplicated IDs', () => {
    const state = migrateState({
      transactions: [],
      coffers: [makeCoffer('common-1', 'common', 1000)],
      cofferSettings: DEFAULT_COFFER_SETTINGS
    });
    expect(validateStateShape(state)).toEqual([]);
    state.transactions.push({
      id: 'common-1',
      date: '2026-03-02',
      type: 'transfer',
      status: 'paid',
      value: 1,
      valueCents: 100,
      cofferId: 'missing',
      cofferOperation: 'deposit',
      cofferPrincipalDeltaCents: 100,
      cofferYieldDeltaCents: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      version: 1
    });
    expect(validateStateShape(state).some((issue) => /duplicado|inexistente/.test(issue))).toBe(true);
  });

  it('normalizes legacy promotional coffer types', () => {
    const state = migrateState({
      coffers: [
        makeCoffer('ml-1', 'marketplace', 0),
        makeCoffer('ml-2', 'marketplace', 0)
      ]
    });
    expect(state.coffers.every((coffer) => coffer.type === 'common')).toBe(true);
  });
});
