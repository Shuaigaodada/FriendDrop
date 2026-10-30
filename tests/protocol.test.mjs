import test from 'node:test';
import assert from 'node:assert/strict';
import { Transfer, BLOCK, WINDOW, MAX_FILE, validateFile, digest } from '../public/protocol.js';

class Channel extends EventTarget {
  readyState = 'open'; bufferedAmount = 0;
  send(data) {
    const copy = typeof data === 'string' ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    queueMicrotask(() => this.other.dispatchEvent(new MessageEvent('message', { data: copy })));
  }
}
function pair() { const a = new Channel(), b = new Channel(); a.other = b; b.other = a; return [a, b]; }
function outcome() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
test('metadata rejects unsafe sizes, names, and accepts exact 3 GB', () => {
  assert.equal(validateFile({ name: '中文.zip', size: MAX_FILE }).size, MAX_FILE);
  for (const size of [-1, MAX_FILE + 1, NaN, Infinity, 0.1, '3']) assert.throws(() => validateFile({ name: 'x', size }));
  for (const name of ['', 'x\n', 'x'.repeat(256), null]) assert.throws(() => validateFile({ name, size: 1 }));
});
for (const size of [0, 1, BLOCK + 7, WINDOW + 1]) {
  test(`transfers ${size} bytes with file hash and bounded unacknowledged data`, { timeout: 15000 }, async () => {
    const [a, b] = pair(); const result = outcome();
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 251);
    const file = new File([bytes], '测试.bin'); let written = 0, closed = false, maxWindow = 0;
    const output = new Uint8Array(size);
    const rx = new Transfer(b, { meta: file, sink: {
      async write(block) { await new Promise(r => setTimeout(r, 1)); output.set(block, written); written += block.length; },
      async close() { closed = true; }, async abort() {},
    }, onError: error => result.resolve({ error }) });
    const tx = new Transfer(a, { file, onProgress: () => { maxWindow = Math.max(maxWindow, tx.sent - tx.acked); }, onComplete: () => result.resolve({ ok: true }), onError: error => result.resolve({ error }) });
    rx.accept(); const finished = await result.promise;
    tx.cleanup(); rx.cleanup();
    assert.ifError(finished.error); assert.equal(closed, true); assert.equal(written, size);
    assert.equal(await digest(output), await digest(bytes)); assert.ok(maxWindow <= WINDOW);
  });
}
test('corruption aborts output and never marks complete', async () => {
  const [a, b] = pair(); let aborted = false, completed = false; const result = outcome();
  const rx = new Transfer(b, { meta: { name: 'x', size: 1 }, sink: { write() { assert.fail('corrupt data must not be written'); }, close() { completed = true; }, abort() { aborted = true; } }, onError: e => result.resolve(e) });
  rx.accept();
  a.send(JSON.stringify({ type: 'block', offset: 0, length: 1, hash: '0'.repeat(64) })); a.send(new Uint8Array([1]));
  assert.match((await result.promise).message, /校验/); await rx.abortPromise; assert.equal(aborted, true); assert.equal(completed, false);
});
test('write failure propagates to sender without a false success', async () => {
  const [a, b] = pair(); const result = outcome(); let aborted = false;
  const file = new File([new Uint8Array(10)], 'x');
  const tx = new Transfer(a, { file, onComplete: () => assert.fail('must not complete'), onError: e => result.resolve(e) });
  const rx = new Transfer(b, { meta: file, sink: { write() { throw new Error('Disk full'); }, close() { assert.fail(); }, abort() { aborted = true; } } });
  rx.accept(); assert.match((await result.promise).message, /取消/); await rx.abortPromise; assert.equal(aborted, true); tx.cleanup();
});
test('out-of-order block and premature complete are rejected', async () => {
  const [a, b] = pair(); const result = outcome();
  const rx = new Transfer(b, { meta: { name: 'x', size: 1 }, sink: { abort() {} }, onError: e => result.resolve(e) });
  rx.accept(); a.send(JSON.stringify({ type: 'block', offset: 1, length: 1, hash: '0'.repeat(64) }));
  assert.match((await result.promise).message, /不合法/);
  const second = outcome(); const tx = new Transfer(a, { file: new File(['x'], 'x'), onError: e => second.resolve(e) });
  b.send(JSON.stringify({ type: 'complete', size: 1 })); assert.match((await second.promise).message, /不合法/); tx.cleanup();
});
test('cancellation aborts sink and stops sender', async () => {
  const [a, b] = pair(); const result = outcome(); let aborted = false;
  const file = new File([new Uint8Array(3 * BLOCK)], 'x');
  const tx = new Transfer(a, { file, onError: e => result.resolve(e) });
  const rx = new Transfer(b, { meta: file, sink: { write() {}, abort() { aborted = true; } } });
  rx.accept(); rx.cancel(); await result.promise; await rx.abortPromise; assert.equal(aborted, true); assert.equal(tx.stopped, true);
});
test('a synchronous abort failure does not swallow the transfer error', async () => {
  const [a] = pair(); let reported;
  const rx = new Transfer(a, { meta: { name:'x',size:1 }, sink: { abort() { throw new Error('Abort failed'); } }, onError: e => { reported=e; } });
  rx.cancel(); await rx.abortPromise;
  assert.equal(rx.stopped,true); assert.match(reported.message,/取消/);
});
