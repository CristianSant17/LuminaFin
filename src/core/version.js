export function formatAppVersion(info) {
  if (!info || typeof info.version !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(info.version)) return null;
  const revision = typeof info.revision === 'string' ? info.revision.trim() : '';
  return revision && revision !== 'local'
    ? `v${info.version} · ${revision.slice(0, 7)}`
    : `v${info.version} (local)`;
}
