import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/core/demo-data.js';
import { validateStateShape } from '../src/core/validation.js';

describe('Dados de demonstração', () => {
  it('creates a valid isolated exploration state', () => {
    const demo = createDemoState({
      settings: { currency: 'BRL', themeMode: 'dark' },
      categories: []
    });
    expect(demo.initialBalances).toHaveLength(1);
    expect(demo.transactions.length).toBeGreaterThan(0);
    expect(demo.fixedExpenses).toHaveLength(1);
    expect(demo.creditCards).toHaveLength(1);
    expect(demo.creditInstallments).toHaveLength(3);
    expect(demo.coffers).toHaveLength(1);
    expect(validateStateShape(demo)).toEqual([]);
  });

  it('uses generic names and keeps demo credit purchases separate from account cash', () => {
    const demo = createDemoState({});
    const purchase = demo.transactions.find((item) => item.sourceType === 'creditPurchase');
    expect(purchase.affectsAccountBalance).toBe(false);
    expect(purchase.accountImpactCents).toBe(0);
    expect(demo.coffers[0].name).toBe('Reserva de segurança');
  });
});
