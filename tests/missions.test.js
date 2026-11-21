import { describe, expect, it } from 'vitest';
import { createEmptyState, migrateState } from '../src/storage/schema.js';
import {
  MISSION_DEFINITIONS,
  MISSION_TRACKS,
  deriveMissionProgress,
  getCurrentMission,
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

  it('organizes the nine missions into three progressive tracks with one current mission', () => {
    const state = createEmptyState();
    expect(MISSION_TRACKS).toHaveLength(3);
    expect(MISSION_DEFINITIONS).toHaveLength(9);
    expect(MISSION_TRACKS.map((track) =>
      MISSION_DEFINITIONS.filter((mission) => mission.trackId === track.id).length
    )).toEqual([3, 3, 3]);
    expect(getCurrentMission(state).id).toBe('initial-balance');
    state.initialBalances = [{ id: 'balance', valueCents: 50000 }];
    state.transactions = [{ id: 'first', sourceType: null }];
    expect(getCurrentMission(state).id).toBe('dashboard-check');
  });

  it('allows the Dashboard check and optional route steps to persist as completed', () => {
    const state = markMissionCompleted(createEmptyState(), 'dashboard-check');
    const completed = markMissionCompleted(state, 'pocket-check');
    expect(deriveMissionProgress(completed).completedIds).toEqual(['dashboard-check', 'pocket-check']);
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
