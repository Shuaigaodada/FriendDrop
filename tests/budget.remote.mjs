import assert from 'node:assert/strict';
const base = process.env.FRIENDDROP_BUDGET_TEST_URL;
assert.ok(base, 'Set FRIENDDROP_BUDGET_TEST_URL to the disposable test Worker');
const run = crypto.randomUUID();
const room = n => n.toString(16).padStart(64,'0');
async function reserve(id) {
  const url = new URL(base); url.search = new URLSearchParams({run,room:id});
  const response = await fetch(url); assert.equal(response.status,200);
  return (await response.json()).allowed;
}
const results = await Promise.all(Array.from({length:20}, (_,i) => reserve(room(i))));
assert.equal(results.filter(Boolean).length,2);
const granted = results.findIndex(Boolean);
assert.equal(await reserve(room(granted)),true);
assert.equal(await reserve(room(100)),false);
assert.equal(await reserve('invalid'),false);
console.log('PASS: 20 concurrent cloud requests granted exactly 2; repeat grant reused; new/invalid requests refused.');
