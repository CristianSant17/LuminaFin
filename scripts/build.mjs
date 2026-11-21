import { readFile, writeFile, mkdir } from 'node:fs/promises';

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
  'src/core/planning.js',
  'src/storage/schema.js',
  'src/ui/navigation.js'
]) {
  const target = `dist/${file}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, await readFile(file));
}
console.log('LuminaFin build concluído em dist/');
