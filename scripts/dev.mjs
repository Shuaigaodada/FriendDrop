import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const logDir = process.env.FRIENDDROP_LOG_DIR || 'D:/Projects/logs/FriendDrop';
mkdirSync(logDir, { recursive: true });
const tempDir = 'D:/Projects/FriendDrop/runtime-temp';
mkdirSync(tempDir, { recursive: true });
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', '127.0.0.1', '--port', '8787'], {
  stdio: 'inherit', env: { ...process.env, TMP: tempDir, TEMP: tempDir, WRANGLER_LOG_PATH: logDir, WRANGLER_SEND_METRICS: 'false' },
});
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
