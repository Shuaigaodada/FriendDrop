import { open, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = 'D:/Projects/FriendDrop/fixtures';
await mkdir(dir, { recursive: true });
const path = `${dir}/three-gb.bin`, size = 3_000_000_000;
const handle = await open(path, 'w'); const hash = createHash('sha256');
const block = Buffer.alloc(8 * 1024 * 1024);
for (let i = 0; i < block.length; i++) block[i] = i % 251;
try {
  for (let offset = 0; offset < size;) {
    const bytes = block.subarray(0, Math.min(block.length, size - offset));
    let written = 0;
    while (written < bytes.length) written += (await handle.write(bytes, written, bytes.length - written)).bytesWritten;
    hash.update(bytes); offset += bytes.length;
  }
} finally { await handle.close(); }
const result = { path, size, sha256: hash.digest('hex') };
await writeFile('D:/Projects/FriendDrop/fixture.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
