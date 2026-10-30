import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const base = 'http://127.0.0.1:8787', Origin = base;
async function room() { const r = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin } }); assert.equal(r.status, 200); return r.json(); }
function client(id) {
  const ws = new WebSocket(`ws://127.0.0.1:8787/api/rooms/${id}/socket`, { headers: { Origin } });
  const messages = [], waiters = [];
  ws.on('message', data => { const value = JSON.parse(data); const index = waiters.findIndex(w => w.type === value.type); if (index >= 0) waiters.splice(index,1)[0].resolve(value); else messages.push(value); });
  ws.on('error', () => {});
  return {
    ws,
    opened: new Promise((resolve,reject) => { ws.once('open',resolve); ws.once('error',reject); }),
    get(type) {
      const i = messages.findIndex(m => m.type === type); if (i >= 0) return Promise.resolve(messages.splice(i,1)[0]);
      return new Promise((resolve,reject) => { const timeout = setTimeout(() => reject(new Error(`Timed out: ${type}`)), 5000); waiters.push({ type, resolve: data => { clearTimeout(timeout); resolve(data); } }); });
    },
    send: data => ws.send(JSON.stringify(data)),
  };
}
test('rejects cross-origin creation and unknown routes', async () => {
  assert.equal((await fetch(`${base}/api/rooms`, { method:'POST', headers:{ Origin:'https://untrusted.invalid' } })).status,403);
  assert.equal((await fetch(`${base}/api/nope`, { headers:{ Origin } })).status,404);
});
test('auth, pair, third-seat refusal, signaling, and disconnect invalidation', {timeout:15000}, async t => {
  const r = await room(); const host = client(r.id); await host.opened; t.after(() => host.ws.terminate());
  host.send({ type:'auth', role:'host', token:r.host }); assert.equal((await host.get('authenticated')).relay,false);
  const bad = client(r.id); await bad.opened; t.after(() => bad.ws.terminate());
  bad.send({type:'auth',role:'guest',token:r.host}); await bad.get('error');
  const guest = client(r.id); await guest.opened; t.after(() => guest.ws.terminate());
  guest.send({type:'auth',role:'guest',token:r.guest}); await guest.get('authenticated'); await guest.get('peer-ready'); await host.get('peer-ready');
  const third = client(r.id); await third.opened; t.after(() => third.ws.terminate());
  third.send({type:'auth',role:'guest',token:r.guest}); await third.get('error');
  host.send({type:'offer',sdp:'test-sdp'}); assert.equal((await guest.get('offer')).sdp,'test-sdp');
  guest.send({type:'answer',sdp:'reply-sdp'}); assert.equal((await host.get('answer')).sdp,'reply-sdp');
  guest.send({type:'upload',payload:'not allowed'}); await guest.get('error'); await host.get('peer-left');
  const stale = client(r.id); await assert.rejects(stale.opened);
});
