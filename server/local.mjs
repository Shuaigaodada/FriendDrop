// Local preview only. Cloudflare deployment uses worker.ts, not this process.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, mkdirSync, appendFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { validSignal } from '../public/signaling.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const rooms = new Map(), limits = new Map();
const logDir = process.env.FRIENDDROP_LOG_DIR || 'D:/Projects/logs/FriendDrop';
mkdirSync(logDir, { recursive: true });
const origins = new Set(['http://127.0.0.1:8787', 'http://localhost:8787']);
const key = () => randomBytes(32).toString('hex');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function allowed(req) {
  if (!origins.has(req.headers.origin)) return false;
  const ip = req.socket.remoteAddress, now = Date.now();
  let rate = limits.get(ip);
  if (!rate || now - rate.since > 60_000) { rate = { count: 0, since: now }; limits.set(ip, rate); }
  return ++rate.count <= 20;
}
function closeRoom(room, message) {
  if (room.closed) return;
  room.closed = true;
  for (const client of room.clients) {
    try { client.send(JSON.stringify({ type: 'peer-left', message })); client.close(1000, '房间关闭'); } catch { /* Closed socket. */ }
  }
  rooms.delete(room.id);
}
function reply(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8787');
    if (url.pathname.startsWith('/api/')) {
      if (!allowed(req)) return reply(res, 403, { error: '来源不允许，或操作过于频繁' });
      if (url.pathname !== '/api/rooms' || req.method !== 'POST') return reply(res, 404, { error: '接口不存在' });
      if (rooms.size >= 100) return reply(res, 429, { error: '房间已满' });
      const room = { id: randomUUID(), host: key(), guest: key(), expires: Date.now() + 15 * 60_000, clients: new Set(), claimed: new Set(), closed: false };
      rooms.set(room.id, room);
      return reply(res, 200, { id: room.id, host: room.host, guest: room.guest, expires: room.expires });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, { error: '不支持的请求' });
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) return reply(res, 403, { error: '禁止访问' });
    const info = await stat(path);
    if (!info.isFile()) return reply(res, 404, { error: '文件不存在' });
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(path).on('error', () => res.destroy()).pipe(res);
  } catch { if (!res.headersSent) reply(res, 404, { error: '文件不存在' }); else res.destroy(); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 24_000 });
server.on('upgrade', (req, socket, head) => {
  const match = /^\/api\/rooms\/([a-f0-9-]{36})\/socket$/.exec(req.url);
  const room = match && rooms.get(match[1]);
  if (!allowed(req) || !room || room.closed || room.expires <= Date.now() || room.clients.size >= 4) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    room.clients.add(ws); let role, since = Date.now(), count = 0;
    const timer = setTimeout(() => { if (!role) ws.close(1008, '认证超时'); }, 10_000);
    ws.on('message', (bytes, binary) => {
      try {
        if (room.closed || binary) throw new Error();
        if (Date.now() - since >= 60_000) { since = Date.now(); count = 0; }
        if (++count > 180) throw new Error();
        const data = JSON.parse(bytes.toString());
        if (!role) {
          if (data.type !== 'auth' || !['host','guest'].includes(data.role) || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token) || room.expires <= Date.now() || room.claimed.has(data.role) || !timingSafeEqual(Buffer.from(data.token), Buffer.from(room[data.role]))) throw new Error();
          role = data.role; room.claimed.add(role); ws.authenticated = true; clearTimeout(timer);
          ws.send(JSON.stringify({ type: 'authenticated', iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relay: false }));
          if (room.claimed.size === 2) {
            room.expires = Date.now() + 4 * 60 * 60_000;
            for (const client of room.clients) if (client.authenticated) client.send(JSON.stringify({ type: 'peer-ready' }));
          }
        } else {
          if (!validSignal(data, role)) throw new Error();
          for (const client of room.clients) if (client !== ws && client.authenticated) client.send(bytes.toString());
        }
      } catch { ws.send(JSON.stringify({ type: 'error', message: '邀请无效、已被使用，或连接消息不合法。请重新创建邀请。' })); ws.close(1008, '请求被拒绝'); }
    });
    ws.on('error', () => { if (role) closeRoom(room, '连接中断'); });
    ws.on('close', () => { clearTimeout(timer); room.clients.delete(ws); if (role) closeRoom(room, '对方已离开，请重新创建邀请'); });
  });
});
const cleanup = setInterval(() => {
  for (const room of rooms.values()) if (room.expires <= Date.now()) closeRoom(room, '邀请或会话已到期');
  for (const [ip, value] of limits) if (Date.now() - value.since > 60_000) limits.delete(ip);
}, 30_000);
server.listen(8787, '127.0.0.1', () => {
  console.log('FriendDrop local preview: http://127.0.0.1:8787 (P2P only; TURN disabled)');
  appendFileSync(resolve(logDir, 'preview.log'), `${new Date().toISOString()} local preview started on 127.0.0.1:8787\n`);
});
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
  clearInterval(cleanup); for (const room of rooms.values()) closeRoom(room, '服务已关闭');
  for (const ws of wss.clients) ws.terminate(); wss.close(); server.close();
});
