import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'script.js', 'manifest.json', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
  await writeFile(`dist/${file}`, await readFile(file));
}
await mkdir('dist/src/core', { recursive: true });
await mkdir('dist/src/storage', { recursive: true });
await mkdir('dist/src/ui', { recursive: true });
for (const file of [
  'src/core/money.js',
  'src/core/finance.js',
  'src/core/fixed-expenses.js',
  'src/core/currency.js',
  'src/core/validation.js',
  'src/core/coffers.js',
  'src/core/credit-cards.js',
  'src/core/planning.js',
  'src/core/presets.js',
  'src/core/help.js',
  'src/core/demo-data.js',
  'src/core/missions.js',
  'src/core/device-sync.js',
  'src/core/backup.js',
  'src/core/version.js',
  'src/storage/schema.js',
  'src/ui/navigation.js'
]) {
  const target = `dist/${file}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, await readFile(file));
}
await mkdir('dist/node_modules/qrcode-generator/dist', { recursive: true });
await writeFile(
  'dist/node_modules/qrcode-generator/dist/qrcode.mjs',
  await readFile('node_modules/qrcode-generator/dist/qrcode.mjs')
);
const packageData = JSON.parse(await readFile('package.json', 'utf8'));
let revision = process.env.GITHUB_SHA || '';
if (!revision) {
  try {
    revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    revision = 'local';
  }
}
await writeFile('dist/version.json', JSON.stringify({
  version: packageData.version,
  revision: revision === 'local' ? revision : revision.slice(0, 7),
  builtAt: new Date().toISOString()
}, null, 2));
console.log('LuminaFin build concluído em dist/');
