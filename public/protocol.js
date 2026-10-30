export const MAX_FILE = 3_000_000_000;
export const BLOCK = 1024 * 1024;
export const FRAME = 16 * 1024;
export const WINDOW = 4 * BLOCK;
export function validateFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name.length || file.name.length > 255 || /[\x00-\x1f]/.test(file.name) ||
      !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE) throw new Error('请选择不超过 3 GB 的有效文件');
  return { name: file.name, size: file.size };
}
export const digest = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
export function parseControl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('传输消息不合法');
  const value = JSON.parse(raw);
  if (!value || typeof value.type !== 'string') throw new Error('传输消息不合法');
  return value;
}

export class Transfer {
  constructor(channel, { file, meta, sink, onProgress = () => {}, onComplete = () => {}, onError = () => {} }) {
    this.channel = channel; this.file = file; this.meta = validateFile(file || meta); this.sink = sink;
    this.onProgress = onProgress; this.onComplete = onComplete; this.onError = onError;
    this.sent = 0; this.received = 0; this.acked = 0; this.queued = 0; this.queuedMessages = 0;
    this.started = false; this.stopped = false; this.queue = Promise.resolve(); this.lastActivity = Date.now();
    channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = BLOCK;
    this.message = event => {
      if (this.stopped) return;
      const size = typeof event.data === 'string' ? event.data.length : event.data.byteLength;
      this.queued += size; this.queuedMessages++;
      if (this.queued > WINDOW + 2 * BLOCK || this.queuedMessages > 600) return this.fail(new Error('对方发送过快或消息异常'));
      this.queue = this.queue.then(async () => {
        if (!this.stopped) await this.handle(event.data);
      }).catch(error => this.fail(error)).finally(() => { this.queued -= size; this.queuedMessages--; });
    };
    this.closed = () => this.fail(new Error('连接中断，请重新发送'));
    channel.addEventListener('message', this.message);
    channel.addEventListener('close', this.closed);
    channel.addEventListener('error', this.closed);
    this.timer = setInterval(() => { if (this.started && Date.now() - this.lastActivity > 120_000) this.fail(new Error('传输超过两分钟没有进展，请重新发送')); }, 5000);
  }
  control(data) { this.channel.send(JSON.stringify(data)); }
  accept() { this.started = true; this.lastActivity = Date.now(); this.control({ type: 'ready' }); }
  async waitFor(test) {
    while (!test()) {
      if (this.stopped || this.channel.readyState !== 'open') throw new Error('传输已停止');
      if (Date.now() - this.lastActivity > 120_000) throw new Error('传输超时，请重新发送');
      await new Promise(resolve => setTimeout(resolve, 8));
    }
    if (this.stopped) throw new Error('传输已停止');
  }
  async send() {
    for (let offset = 0; offset < this.meta.size; offset += BLOCK) {
      const length = Math.min(BLOCK, this.meta.size - offset);
      await this.waitFor(() => this.sent - this.acked + length <= WINDOW);
      const bytes = new Uint8Array(await this.file.slice(offset, offset + length).arrayBuffer());
      const hash = await digest(bytes);
      if (this.stopped) return;
      this.control({ type: 'block', offset, length, hash });
      for (let pos = 0; pos < length; pos += FRAME) {
        await this.waitFor(() => this.channel.bufferedAmount < BLOCK);
        const frame = bytes.subarray(pos, pos + FRAME);
        this.sent += frame.byteLength;
        this.channel.send(frame);
      }
    }
    await this.waitFor(() => this.acked === this.meta.size);
    this.ending = true;
    this.control({ type: 'end', size: this.meta.size });
  }
  async handle(raw) {
    if (typeof raw !== 'string') {
      if (this.file || !this.started || !this.pending || !(raw instanceof ArrayBuffer) || !raw.byteLength || raw.byteLength > FRAME || this.pending.pos + raw.byteLength > this.pending.length) throw new Error('文件数据顺序或大小不正确');
      this.pending.bytes.set(new Uint8Array(raw), this.pending.pos); this.pending.pos += raw.byteLength;
      if (this.pending.pos === this.pending.length) {
        if (await digest(this.pending.bytes) !== this.pending.hash) throw new Error('文件校验失败，请重新发送');
        if (this.stopped) return;
        await this.sink.write(this.pending.bytes);
        if (this.stopped) return;
        this.received += this.pending.length; this.pending = null; this.lastActivity = Date.now();
        this.control({ type: 'ack', offset: this.received }); this.onProgress(this.received);
      }
      return;
    }
    const data = parseControl(raw);
    if (data.type === 'cancel') throw new Error('对方取消了传输');
    if (this.file) {
      if (data.type === 'ready' && !this.started) {
        this.started = true; this.lastActivity = Date.now();
        void this.send().catch(error => this.fail(error));
      } else if (data.type === 'ack' && this.started && Number.isSafeInteger(data.offset) && data.offset > this.acked && data.offset <= this.sent && (data.offset % BLOCK === 0 || data.offset === this.meta.size)) {
        this.acked = data.offset; this.lastActivity = Date.now(); this.onProgress(this.acked);
      } else if (data.type === 'complete' && this.ending && this.acked === this.meta.size && data.size === this.meta.size) {
        this.cleanup(); this.onComplete();
      } else throw new Error('接收回执不合法');
    } else if (data.type === 'block' && this.started && !this.pending && data.offset === this.received && data.length === Math.min(BLOCK, this.meta.size - this.received) && data.length > 0 && /^[a-f0-9]{64}$/.test(data.hash)) {
      this.pending = { ...data, pos: 0, bytes: new Uint8Array(data.length) };
    } else if (data.type === 'end' && this.started && !this.pending && this.received === this.meta.size && data.size === this.meta.size) {
      const result = await this.sink.close();
      if (this.stopped) return;
      this.control({ type: 'complete', size: this.received }); this.cleanup(); this.onComplete(result);
    } else throw new Error('文件传输消息不合法');
  }
  cleanup() {
    this.stopped = true; clearInterval(this.timer);
    this.channel.removeEventListener('message', this.message);
    this.channel.removeEventListener('close', this.closed);
    this.channel.removeEventListener('error', this.closed);
  }
  fail(error) {
    if (this.stopped) return;
    try { this.control({ type: 'cancel' }); } catch { /* Connection already lost. */ }
    this.cleanup(); this.pending = null;
    this.abortPromise = Promise.resolve().then(() => this.sink?.abort()).catch(() => {});
    this.onError(error);
  }
  cancel() { this.fail(new Error('传输已取消')); }
}
