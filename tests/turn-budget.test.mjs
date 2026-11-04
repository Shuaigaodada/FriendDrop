import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reserveTurnRoom } from '../server/turn-budget.js';
const room = n => n.toString(16).padStart(64, '0');
function database() {
  const db = new DatabaseSync(':memory:');
  return { db, sql: { exec(query, ...args) {
    const statement = db.prepare(query);
    const rows = query.startsWith('SELECT') ? statement.all(...args) : (statement.run(...args), []);
    return { toArray: () => rows };
  } } };
}
test('monthly TURN reservations are bounded, idempotent, persistent and reset in UTC', () => {
  const {db,sql} = database();
  try {
    const now = new Date('2026-11-30T23:59:59Z');
    for (let i=0;i<40;i++) assert.equal(reserveTurnRoom(sql,room(i),'40',now),true);
    for (let i=40;i<100;i++) assert.equal(reserveTurnRoom(sql,room(i),'40',now),false);
    assert.equal(reserveTurnRoom(sql,room(0),'40',now),true);
    assert.equal(reserveTurnRoom(sql,room(0),'0',now),false);
    assert.equal(reserveTurnRoom(sql,room(40),'40',new Date('2026-12-01T00:00:00Z')),true);
    assert.equal(sql.exec('SELECT COUNT(*) AS n FROM reservations').toArray()[0].n,41);
  } finally { db.close(); }
});
test('invalid or disabled budget never grants a reservation', () => {
  const {db,sql} = database();
  try {
    for (const cap of [undefined,'','bad','0','-1','1.5','41','Infinity']) assert.equal(reserveTurnRoom(sql,room(1),cap),false);
    assert.equal(reserveTurnRoom(sql,'invalid','40'),false);
  } finally { db.close(); }
});
