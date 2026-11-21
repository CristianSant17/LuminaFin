import { describe, expect, it } from 'vitest';
import {
  createSyncEnvelope,
  decodeSyncPackage,
  encodeSyncPackage,
  mergeSyncStates,
  validateSyncEnvelope
} from '../src/core/device-sync.js';
import { createEmptyState } from '../src/storage/schema.js';

function category(id, name, updatedAt) {
  return {
    id,
    name,
    type: 'expense',
    icon: '•',
    limitCents: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    deletedAt: null,
    version: 1
  };
}

describe('Device sync', () => {
  it('validates full sync envelopes and rejects incomplete payloads', () => {
    const state = createEmptyState();
    const envelope = createSyncEnvelope(state);
    expect(validateSyncEnvelope(envelope).schemaVersion).toBe(state.schemaVersion);
    expect(() => validateSyncEnvelope({
      ...envelope,
      state: { ...state, transactions: undefined }
    })).toThrow(/incompleto/i);
  });

  it('merges independent changes and resolves same-ID updates by updatedAt', () => {
    const local = createEmptyState();
    local.updatedAt = '2026-01-02T00:00:00.000Z';
    local.categories = [
      category('category-shared', 'Categoria local antiga', '2026-01-02T00:00:00.000Z'),
      category('category-local', 'Somente no computador', '2026-01-02T00:00:00.000Z')
    ];
    const remote = createEmptyState();
    remote.updatedAt = '2026-01-03T00:00:00.000Z';
    remote.categories = [
      category('category-shared', 'Categoria atualizada no celular', '2026-01-03T00:00:00.000Z'),
      category('category-remote', 'Somente no celular', '2026-01-03T00:00:00.000Z')
    ];

    const merged = mergeSyncStates(local, remote);
    expect(merged.categories).toHaveLength(3);
    expect(merged.categories.find((item) => item.id === 'category-shared').name)
      .toBe('Categoria atualizada no celular');
    expect(merged.categories.map((item) => item.id)).toContain('category-local');
    expect(merged.categories.map((item) => item.id)).toContain('category-remote');
    expect(merged.settings).toEqual(remote.settings);
  });

  it('honors newer deletion records when merging changes', () => {
    const local = createEmptyState();
    local.categories = [category('category-removed', 'Categoria antiga', '2026-01-02T00:00:00.000Z')];
    const remote = createEmptyState();
    remote.deletedItems = [{
      id: 'trash-1',
      type: 'category',
      entityId: 'category-removed',
      data: category('category-removed', 'Categoria antiga', '2026-01-02T00:00:00.000Z'),
      createdAt: '2026-01-04T00:00:00.000Z',
      updatedAt: '2026-01-04T00:00:00.000Z',
      deletedAt: '2026-01-04T00:00:00.000Z',
      version: 1
    }];

    const merged = mergeSyncStates(local, remote);
    expect(merged.categories).toEqual([]);
    expect(merged.deletedItems).toHaveLength(1);
  });

  it('round-trips an offline package through the compressed/base64URL format', async () => {
    const envelope = createSyncEnvelope(createEmptyState());
    const encoded = await encodeSyncPackage(envelope);
    const decoded = await decodeSyncPackage(encoded);
    expect(decoded.transactions).toEqual([]);
    expect(decoded.settings.baseCurrency).toBe('BRL');
  });
});
