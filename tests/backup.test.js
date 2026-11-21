import { describe, expect, it } from 'vitest';
import {
  createSelectiveBackup,
  getBackupReminder,
  getBackupSections,
  restoreBackupSections
} from '../src/core/backup.js';
import { createEmptyState, migrateState } from '../src/storage/schema.js';
import { validateStateShape } from '../src/core/validation.js';

function entity(id, extra = {}) {
  const timestamp = '2026-03-01T00:00:00.000Z';
  return { id, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1, ...extra };
}

describe('Selective backups', () => {
  it('exports selected modules and necessary category dependencies only', () => {
    const state = createEmptyState();
    state.categories = [entity('food', { name: 'Alimentação', type: 'expense', icon: '•', limitCents: 0 })];
    state.transactions = [
      entity('tx-1', { type: 'expense', category: 'food', date: '2026-03-02', status: 'paid', valueCents: 2500, value: 25, sourceType: null }),
      entity('tx-card', { type: 'expense', category: 'food', date: '2026-03-02', status: 'pending', valueCents: 3000, value: 30, sourceType: 'creditPurchase' })
    ];
    state.initialBalances = [entity('balance-1', { date: '2026-03-02', valueCents: 10000, value: 100 })];

    const backup = createSelectiveBackup(state, ['transactions']);
    expect(backup.includedSections).toEqual(['transactions']);
    expect(backup.state.transactions.map((item) => item.id)).toEqual(['tx-1']);
    expect(backup.state.categories.map((item) => item.id)).toEqual(['food']);
    expect(backup.state.initialBalances.map((item) => item.id)).toEqual(['balance-1']);
    expect(backup.state.creditCards).toEqual([]);
    expect(getBackupSections(backup)).toEqual(['transactions']);
    expect(validateStateShape(migrateState(backup.state))).toEqual([]);
  });

  it('restores only selected groups and preserves unselected local data', () => {
    const local = createEmptyState();
    local.transactions = [entity('local-tx', { type: 'expense', category: '', valueCents: 100, value: 1 })];
    local.fixedExpenses = [entity('local-fixed')];
    const imported = createEmptyState();
    imported.transactions = [entity('remote-tx', { type: 'expense', category: '', valueCents: 200, value: 2 })];
    imported.fixedExpenses = [entity('remote-fixed')];

    const restored = restoreBackupSections(local, imported, ['transactions']);
    expect(restored.transactions.map((item) => item.id)).toEqual(['remote-tx']);
    expect(restored.fixedExpenses.map((item) => item.id)).toEqual(['local-fixed']);
  });

  it('treats legacy backups without section metadata as complete', () => {
    expect(getBackupSections({ state: {} })).toHaveLength(7);
  });

  it('reminds for missing, stale, or changed backups, but honors snoozing', () => {
    const now = Date.parse('2026-03-31T00:00:00.000Z');
    expect(getBackupReminder({ now })).toMatch(/ainda não fez/i);
    expect(getBackupReminder({
      now,
      lastBackupAt: '2026-03-01T00:00:00.000Z',
      lastBackupStateUpdatedAt: '2026-03-01T00:00:00.000Z',
      stateUpdatedAt: '2026-03-01T00:00:00.000Z'
    })).toMatch(/tempo/i);
    expect(getBackupReminder({
      now,
      lastBackupAt: '2026-03-20T00:00:00.000Z',
      lastBackupStateUpdatedAt: '2026-03-20T00:00:00.000Z',
      stateUpdatedAt: '2026-03-21T00:00:00.000Z'
    })).toMatch(/alterações/i);
    expect(getBackupReminder({
      now,
      lastBackupAt: '2026-03-20T00:00:00.000Z',
      snoozedUntil: '2026-04-01T00:00:00.000Z'
    })).toBeNull();
  });
});
