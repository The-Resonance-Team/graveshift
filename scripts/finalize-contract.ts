import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Only generated declarations get JS suffixes. Source imports keep the workspace convention.
const dist = resolve(process.cwd(), 'dist');
await Promise.all(
  (await readdir(dist))
    .filter((entry) => entry.endsWith('.d.ts'))
    .map(async (entry) => {
      const file = resolve(dist, entry);
      const source = await readFile(file, 'utf8');
      await writeFile(
        file,
        source.replace(
          /(from\s+['"])(\.[^'"]+)(['"])/g,
          (_match, prefix: string, target: string, suffix: string) =>
            `${prefix}${target.endsWith('.js') ? target : `${target}.js`}${suffix}`,
        ),
      );
    }),
);
await Promise.all([
  copyFile(new URL('../LICENSE', import.meta.url), resolve(dist, 'LICENSE')),
  copyFile(new URL('../NOTICE', import.meta.url), resolve(dist, 'NOTICE')),
]);
