import { DurableObject } from 'cloudflare:workers';
import { validSignal } from '../public/signaling.js';
import { reserveTurnRoom } from './turn-budget.js';

type RuntimeEnv = Env & { TURN_KEY_ID?: string; TURN_API_TOKEN?: string };
type Seat = { role?: 'host' | 'guest'; ready?: boolean; count: number; since: number };
type RoomRow = { host: string; guest: string; expires: number; hostUsed: number; guestUsed: number; closed: number };
const TOKEN = /^[a-f0-9]{64}$/;
const ROOM = /^\/api\/rooms\/([a-f0-9-]{36})\/socket$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const same = (a: string, b: string) => TOKEN.test(a) && crypto.subtle.timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin') || '';
    if (!env.ALLOWED_ORIGINS.split(',').includes(origin)) return json({ error: '不允许的网页来源' }, 403);
    const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Cache-Control': 'no-store' };
    const respond = (response: Response) => {
      for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
      return response;
    };
    if (request.method === 'OPTIONS') return respond(new Response(null, { headers: {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
    } }));
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (!(await env.REQUEST_LIMIT.limit({ key: ip })).success) return respond(json({ error: '操作太频繁，请稍后再试' }, 429));
    try {
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const id = crypto.randomUUID();
        const host = token(), guest = token(), expires = Date.now() + 15 * 60_000;
        await env.ROOMS.getByName(id).initialize(host, guest, expires);
        return respond(json({ id, host, guest, expires }));
      }
      const match = ROOM.exec(url.pathname);
      if (match && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        return await env.ROOMS.getByName(match[1]).fetch(request);
      }
      return respond(json({ error: '找不到请求的服务' }, 404));
    } catch {
      console.error(JSON.stringify({ event: 'service_error' }));
      return respond(json({ error: '连接服务暂时不可用' }, 503));
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;

export class Room extends DurableObject<RuntimeEnv> {
  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS room (
      id INTEGER PRIMARY KEY CHECK(id = 1), host TEXT, guest TEXT, expires INTEGER,
      hostUsed INTEGER DEFAULT 0, guestUsed INTEGER DEFAULT 0, closed INTEGER DEFAULT 0
    )`);
  }
  async initialize(host: string, guest: string, expires: number) {
    this.ctx.storage.sql.exec('INSERT INTO room(id,host,guest,expires) VALUES(1,?,?,?)', host, guest, expires);
    await this.ctx.storage.setAlarm(expires);
  }
  row() { return this.ctx.storage.sql.exec<RoomRow>('SELECT * FROM room WHERE id=1').toArray()[0]; }
  async fetch(_request: Request) {
    const row = this.row();
    if (!row || row.closed || Date.now() >= row.expires) return json({ error: '邀请已失效' }, 410);
    if (this.ctx.getWebSockets().length >= 4) return json({ error: '连接数超限' }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ count: 0, since: Date.now() } satisfies Seat);
    setTimeout(() => { if (!server.deserializeAttachment()?.role) server.close(1008, '认证超时'); }, 10_000);
    return new Response(null, { status: 101, webSocket: client });
  }
  async iceServers(): Promise<{ iceServers: RTCIceServer[]; relay: boolean }> {
    const iceServers: RTCIceServer[] = [{ urls: this.env.STUN_URL }];
    if (this.env.TURN_KEY_ID && this.env.TURN_API_TOKEN) {
      try {
        if (!await this.env.TURN_BUDGET.getByName('monthly').reserve(this.ctx.id.toString())) return { iceServers, relay: false };
        const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
          method: 'POST', headers: { Authorization: `Bearer ${this.env.TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 18000 }), signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('TURN credentials unavailable');
        const body = await response.json<{ iceServers: RTCIceServer | RTCIceServer[] }>();
        const entries = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
        for (const entry of entries) {
          if (!entry || !entry.urls) throw new Error('Invalid ICE response');
          iceServers.push(entry);
        }
        return { iceServers, relay: true };
      } catch { console.warn(JSON.stringify({ event: 'turn_unavailable' })); }
    }
    return { iceServers, relay: false };
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const row = this.row();
      if (!row || row.closed) { ws.close(1008, '房间已关闭'); return; }
      if (typeof message !== 'string' || message.length > 24_000) throw new Error('Invalid message');
      const seat: Seat = ws.deserializeAttachment();
      if (Date.now() - seat.since >= 60_000) { seat.count = 0; seat.since = Date.now(); }
      if (++seat.count > 180) throw new Error('Rate limit');
      ws.serializeAttachment(seat);
      const data = JSON.parse(message);
      if (!seat.role) {
        if (data.type !== 'auth' || !['host', 'guest'].includes(data.role) || typeof data.token !== 'string' || Date.now() >= row.expires) throw new Error('Unauthorized');
        const role: 'host' | 'guest' = data.role;
        if (!same(data.token, row[role]) || row[role === 'host' ? 'hostUsed' : 'guestUsed']) throw new Error('Unauthorized');
        // No external await between checking and claiming a seat.
        this.ctx.storage.sql.exec(role === 'host' ? 'UPDATE room SET hostUsed=1 WHERE id=1' : 'UPDATE room SET guestUsed=1 WHERE id=1');
        seat.role = role;
        ws.serializeAttachment(seat);
        const config = await this.iceServers();
        if (this.row()?.closed || ws.readyState !== 1) return;
        seat.ready = true;
        ws.serializeAttachment(seat);
        ws.send(JSON.stringify({ type: 'authenticated', ...config }));
        const peers = this.ctx.getWebSockets().filter(s => s.deserializeAttachment()?.ready);
        if (peers.length === 2) {
          await this.ctx.storage.setAlarm(Date.now() + 4 * 60 * 60_000);
          for (const peer of peers) peer.send(JSON.stringify({ type: 'peer-ready' }));
        }
        return;
      }
      if (!seat.ready) throw new Error('Not ready');
      if (!validSignal(data, seat.role)) throw new Error('Invalid signal');
      for (const peer of this.ctx.getWebSockets()) if (peer !== ws && peer.deserializeAttachment()?.ready) peer.send(message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '邀请无效、已被使用，或连接消息不合法。请重新创建邀请。' }));
      ws.close(1008, '请求被拒绝');
    }
  }
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _clean: boolean) {
    if (ws.deserializeAttachment()?.role) await this.close('对方已离开，请重新创建邀请');
  }
  async webSocketError(ws: WebSocket) { if (ws.deserializeAttachment()?.role) await this.close('连接中断'); }
  async close(message: string) {
    this.ctx.storage.sql.exec('UPDATE room SET closed=1 WHERE id=1');
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({ type: 'peer-left', message })); ws.close(1000, '房间关闭'); } catch { /* Socket already closed. */ }
    }
    this.ctx.storage.sql.exec('DELETE FROM room');
    await this.ctx.storage.deleteAlarm();
  }
  async alarm() { await this.close('邀请或会话已到期，请重新创建'); }
}

export class TurnBudget extends DurableObject<RuntimeEnv> {
  reserve(room: string) {
    return reserveTurnRoom(this.ctx.storage.sql, room, this.env.TURN_MONTHLY_ROOM_LIMIT);
  }
}

type RTCIceServer = { urls: string | string[]; username?: string; credential?: string };
