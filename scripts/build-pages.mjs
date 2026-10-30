import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function apiOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('FRIENDDROP_API_BASE must be an HTTPS origin without credentials, path, query, or fragment');
  return url.origin;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const api = apiOrigin(process.env.FRIENDDROP_API_BASE || '');
  await mkdir('dist', { recursive: true });
  await cp('public', 'dist', { recursive: true });
  await writeFile('dist/config.js', `export const API_BASE = ${JSON.stringify(api)};\n`);
  await writeFile('dist/.nojekyll', '');
  console.log('Static Pages files ready in dist/');
}
