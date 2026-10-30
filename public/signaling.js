export function validSignal(data, role) {
  if (!data || typeof data !== 'object') return false;
  if (data.type === 'offer' || data.type === 'answer') return data.type === (role === 'host' ? 'offer' : 'answer') && typeof data.sdp === 'string' && data.sdp.length <= 20_000;
  const c = data.candidate;
  return data.type === 'candidate' && !!c && typeof c.candidate === 'string' && c.candidate.length <= 2048 &&
    (c.sdpMid === null || typeof c.sdpMid === 'string') && (c.sdpMLineIndex === null || (Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 100));
}
