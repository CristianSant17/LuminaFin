import { describe, expect, it } from 'vitest';
import { createEmptyState, migrateState } from '../src/storage/schema.js';
import {
  MISSION_DEFINITIONS,
  deriveMissionProgress,
  markMissionCompleted,
  normalizeMissionState
} from '../src/core/missions.js';

describe('Missões da trilha inicial', () => {
  it('moves completed missions out of the active list', () => {
    const state = createEmptyState();
    state.initialBalances = [{ id: 'initial', valueCents: 10000 }];
    const progress = deriveMissionProgress(state);
    expect(progress.completedIds).toContain('initial-balance');
    expect(MISSION_DEFINITIONS.filter((mission) =>
      !progress.completedIds.includes(mission.id)
    ).every((mission) => mission.id !== 'initial-balance')).toBe(true);
  });

  it('persists manual and derived mission progress through migration', () => {
    const state = markMissionCompleted(createEmptyState(), 'backup');
    state.fixedExpenses = [{ id: 'fixed-1' }];
    const migrated = migrateState(state);
    const progress = deriveMissionProgress(migrated);
    expect(progress.completedIds).toContain('backup');
    expect(progress.completedIds).toContain('fixed-expenses');
  });

  it('normalizes dismissed and minimized widget state safely', () => {
    expect(normalizeMissionState({
      completedIds: ['backup', 'backup', null],
      dismissed: true,
      minimized: true
    })).toEqual({
      completedIds: ['backup'],
      dismissed: true,
      minimized: true,
      updatedAt: null
    });
  });

  it('does not mark first transaction for a demo-only state', () => {
    const state = createEmptyState();
    state.transactions = [{ id: 'demo', sourceType: 'demo' }];
    expect(deriveMissionProgress(state).completedIds).not.toContain('first-transaction');
  });
});
