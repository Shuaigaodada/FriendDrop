import test from 'node:test';
import assert from 'node:assert/strict';
import { apiOrigin } from '../scripts/build-pages.mjs';
import { validSignal } from '../public/signaling.js';
test('Pages configuration cannot include HTTP, secrets, or script injection', () => {
  assert.equal(apiOrigin('https://example.workers.dev/'), 'https://example.workers.dev');
  for (const bad of ['', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/?key=secret', 'https://example.com/#x', 'javascript:alert(1)', 'https://example.com/path']) assert.throws(() => apiOrigin(bad));
});
test('signaling validates role and bounds candidate data', () => {
  assert.equal(validSignal({type:'offer',sdp:'x'},'host'),true);
  assert.equal(validSignal({type:'offer',sdp:'x'},'guest'),false);
  assert.equal(validSignal({type:'candidate',candidate:{candidate:'x',sdpMid:'0',sdpMLineIndex:0}},'host'),true);
  for (const data of [null, {}, {type:'file'}, {type:'offer',sdp:'x'.repeat(20001)}, {type:'candidate',candidate:{candidate:'x',sdpMid:null,sdpMLineIndex:-1}}]) assert.equal(validSignal(data,'host'),false);
});
