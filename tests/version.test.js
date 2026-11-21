import { describe, expect, it } from 'vitest';
import { formatAppVersion } from '../src/core/version.js';

describe('App version display', () => {
  it('formats release metadata and uses a local fallback label', () => {
    expect(formatAppVersion({ version: '2.1.0', revision: 'abcdef012345' }))
      .toBe('v2.1.0 · abcdef0');
    expect(formatAppVersion({ version: '2.1.0', revision: 'local' }))
      .toBe('v2.1.0 (local)');
    expect(formatAppVersion({ version: 'invalid' })).toBeNull();
  });
});
