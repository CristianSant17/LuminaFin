import { describe, expect, it } from 'vitest';
import { COFFER_PRESETS, GOAL_PRESETS, TRANSACTION_PRESETS } from '../src/core/presets.js';

describe('Sugestões inteligentes', () => {
  it('offers editable generic coffer profiles', () => {
    expect(Object.keys(COFFER_PRESETS)).toEqual(['security', 'medium', 'tier', 'purchase']);
    expect(COFFER_PRESETS.security.accrualMode).toBe('calendar');
    expect(COFFER_PRESETS.tier.bonusCap).toBe(5000);
  });

  it('provides paid, pending and credit purchase presets', () => {
    expect(TRANSACTION_PRESETS.salary.status).toBe('paid');
    expect(TRANSACTION_PRESETS.housing.status).toBe('pending');
    expect(TRANSACTION_PRESETS.installmentPurchase.method).toBe('creditCard');
    expect(TRANSACTION_PRESETS.installmentPurchase.installments).toBe(3);
  });

  it('keeps goal suggestions editable and generic', () => {
    expect(GOAL_PRESETS.emergency.name).toBe('Reserva de emergência');
    expect(GOAL_PRESETS.emergency.target).toBe(6000);
  });
});
