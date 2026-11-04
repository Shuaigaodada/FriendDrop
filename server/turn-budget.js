// This caps credential issuance, not Cloudflare's metered bytes or bill.
export function reserveTurnRoom(sql, room, limit, now = new Date()) {
  const cap = Number(limit);
  if (!Number.isInteger(cap) || cap < 1 || cap > 40 || !/^[a-f0-9]{64}$/.test(room)) return false;
  const month = now.toISOString().slice(0, 7);
  sql.exec('CREATE TABLE IF NOT EXISTS reservations (month TEXT NOT NULL, room TEXT NOT NULL, PRIMARY KEY(month,room))');
  if (sql.exec('SELECT room FROM reservations WHERE month=? AND room=?', month, room).toArray().length) return true;
  // Synchronous SQLite operations in one DO turn: concurrent rooms cannot oversubscribe.
  const used = sql.exec('SELECT COUNT(*) AS n FROM reservations WHERE month=?', month).toArray()[0].n;
  if (used >= cap) return false;
  sql.exec('INSERT INTO reservations(month,room) VALUES(?,?)', month, room);
  return true;
}
