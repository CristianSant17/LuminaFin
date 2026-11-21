import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const background = [15, 23, 42, 255];
  const accent = [56, 189, 248, 255];
  const white = [255, 255, 255, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (size * y + x) << 2;
      const dx = x - size * 0.5;
      const dy = y - size * 0.5;
      let color = background;
      if (dx * dx + dy * dy < size * size * 0.34) color = accent;
      if (
        Math.abs(dx) < size * 0.26 &&
        Math.abs(dy) < size * 0.035
      ) color = white;
      if (
        Math.abs(dx) < size * 0.16 &&
        Math.abs(dy) < size * 0.16 &&
        dx * dx + dy * dy > size * size * 0.014
      ) color = white;
      png.data[offset] = color[0];
      png.data[offset + 1] = color[1];
      png.data[offset + 2] = color[2];
      png.data[offset + 3] = color[3];
    }
  }
  return PNG.sync.write(png);
}

await writeFile('icon-192.png', createIcon(192));
await writeFile('icon-512.png', createIcon(512));
