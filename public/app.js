import { API_BASE } from './config.js';
import { Transfer, validateFile, parseControl, digest } from './protocol.js';
import { createSink, cleanOldFiles } from './storage.js';

const $ = id => document.getElementById(id);
const show = (id, visible = true) => { $(id).hidden = !visible; };
const status = (title, detail) => {
  if ($('status').textContent !== title) $('status').textContent = title;
  if ($('detail').textContent !== detail) $('detail').textContent = detail;
};
const format = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`;
const base = (API_BASE || location.origin).replace(/\/$/, '');
let socket, peer, channel, transfer, selected, metadata, sink, saved, role, ready = false, terminal = false, active = false;
let generation = 0, connectTimer, routeTimer, disconnectedTimer, wake, signalQueue = Promise.resolve(), pendingCandidates = [];
let lastBytes = 0, lastTime = 0;
const invite = new URLSearchParams(location.hash.slice(1));
const invited = invite.has('room') || invite.has('key');
function fileInfo(file) { metadata = validateFile(file); $('filename').textContent = metadata.name; $('filesize').textContent = format(metadata.size); show('file-panel'); }
function signal(data) { if (socket?.readyState !== WebSocket.OPEN) throw new Error('连接服务已断开'); socket.send(JSON.stringify(data)); }
function fail(error) {
  if (terminal) return;
  terminal = true; active = false; clearTimeout(connectTimer); clearTimeout(disconnectedTimer); clearInterval(routeTimer);
  if (transfer && !transfer.stopped) transfer.cancel();
  if (!transfer && sink) void sink.abort().catch(() => {});
  peer?.close(); socket?.close(); void wake?.release().catch(() => {});
  for (const id of ['pick-panel','invite-panel','accept-panel','join-panel','cancel']) show(id, false);
  status('这次没能传完', '文件没有完成接收。可以重新创建邀请再试一次。');
  $('error').textContent = error.name === 'QuotaExceededError' ? '浏览器存储额度不足。请退出无痕模式，或使用电脑 Chrome / Edge 直接保存到磁盘。' : error.message || '操作失败，请重新尝试'; show('error'); show('reset');
}
function progress(bytes) {
  if (!active) { lastTime = performance.now(); void holdScreen(); }
  active = true; show('progress-panel'); show('accept-panel', false); show('invite-panel', false);
  status(role === 'host' ? '正在传给朋友' : '正在接收文件', '请保持双方页面打开。');
  const percent = metadata.size ? bytes / metadata.size * 100 : 100;
  $('percent').textContent = `${Math.floor(percent)}%`; $('progress').value = percent;
  $('bytes').textContent = `${format(bytes)} / ${format(metadata.size)}`;
  const now = performance.now();
  if (now - lastTime > 500) { $('speed').textContent = `${format((bytes - lastBytes) / ((now - lastTime) / 1000))}/s`; lastBytes = bytes; lastTime = now; }
}
function complete(result) {
  progress(metadata.size); terminal = true; active = false; clearTimeout(connectTimer); clearTimeout(disconnectedTimer); clearInterval(routeTimer);
  $('speed').textContent = '校验通过'; show('cancel', false); show('reset'); void wake?.release().catch(() => {});
  if (role === 'host') status('朋友已收到', '文件已完整接收，并通过分块校验。');
  else if (result?.direct) status('文件已保存', '已写入你选择的位置，并通过分块校验。');
  else {
    saved = result; status('接收完成，记得保存', '文件已通过校验。点击下方按钮保存到设备。');
    $('download').href = result.url; $('download').download = result.name; show('download-panel'); show('reset', false);
  }
}
async function holdScreen() { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* Optional capability; keep foreground guidance visible. */ } }
function setupChannel(dc) {
  if (channel) { dc.close(); return fail(new Error('对方创建了重复的数据连接')); }
  channel = dc; channel.binaryType = 'arraybuffer';
  channel.addEventListener('close', () => { if (!terminal) fail(new Error('文件连接中断，请重新发送')); });
  channel.addEventListener('error', () => fail(new Error('文件连接异常，请重新发送')));
  const open = async () => {
    try {
      clearTimeout(connectTimer);
      const fingerprints = [peer.localDescription.sdp, peer.remoteDescription.sdp].map(sdp => sdp.match(/a=fingerprint:sha-256 ([^\r\n]+)/i)?.[1]);
      if (fingerprints.some(value => !value)) throw new Error('无法核对连接身份');
      const code = (await digest(new TextEncoder().encode(fingerprints.sort().join('|')))).slice(0, 12).toUpperCase();
      if (terminal) return;
      $('verify').textContent = `双方确认码：${code.slice(0, 6)} ${code.slice(6)}（请与朋友核对）`; show('verify');
      if (role === 'host') {
        transfer = new Transfer(channel, { file: selected, onProgress: progress, onComplete: complete, onError: fail });
        channel.send(JSON.stringify({ type: 'file', ...metadata }));
        status('朋友已连接', '等待朋友确认接收，并选择保存位置。'); show('invite-panel', false);
      }
      await updateRoute(); routeTimer = setInterval(() => void updateRoute(), 3000);
    } catch (error) { fail(error); }
  };
  channel.addEventListener('open', () => void open(), { once: true });
  if (role === 'guest') channel.addEventListener('message', offer);
}
function offer(event) {
  if (terminal || transfer) return;
  try {
    const data = parseControl(event.data);
    if (data.type === 'cancel') throw new Error('对方取消了传输');
    if (data.type !== 'file' || metadata) throw new Error('对方发送了异常文件信息');
    fileInfo(data); status('朋友发来了一个文件', '核对文件和确认码，再选择接收。'); show('accept-panel');
    const direct = typeof window.showSaveFilePicker === 'function';
    $('accept').textContent = direct ? '选择保存位置并接收' : '接收文件';
    $('storage-note').textContent = direct ? '文件分块写入你选择的位置。' : '请退出无痕模式。文件暂存到本地，完成后需点击保存。手机 3 GB 尚未验证。';
  } catch (error) { fail(error); }
}
async function updateRoute() {
  if (!peer || peer.connectionState === 'closed') return;
  try {
    const stats = await peer.getStats();
    const transport = [...stats.values()].find(r => r.type === 'transport' && r.selectedCandidatePairId);
    const pair = transport && stats.get(transport.selectedCandidatePairId);
    if (!pair) return;
    const relay = [stats.get(pair.localCandidateId), stats.get(pair.remoteCandidateId)].some(r => r?.candidateType === 'relay');
    $('route').textContent = relay ? '已连接 · 加密中继' : '已连接 · P2P 直连'; show('route');
  } catch { /* Closing a peer can race with getStats. */ }
}
function createPeer(config) {
  peer = new RTCPeerConnection({ iceServers: config.iceServers });
  peer.addEventListener('icecandidate', event => { if (event.candidate && !terminal) { try { signal({ type: 'candidate', candidate: event.candidate.toJSON() }); } catch (e) { fail(e); } } });
  peer.addEventListener('datachannel', event => setupChannel(event.channel));
  peer.addEventListener('connectionstatechange', () => {
    clearTimeout(disconnectedTimer);
    if (peer.connectionState === 'failed') fail(new Error(config.relay ? '直连和中继均未能连接，请换个网络重试' : '直连失败；当前未配置可用中继，请换个网络或配置中继后重试'));
    if (peer.connectionState === 'disconnected') disconnectedTimer = setTimeout(() => fail(new Error('网络连接中断，请重新发送')), 15_000);
  });
  $('route').textContent = config.relay ? 'P2P 优先，中继可用' : '当前仅支持直连，中继未启用'; show('route');
}
async function handleSignal(data) {
  if (terminal) return;
  if (data.type === 'authenticated') { createPeer(data); ready = true; return; }
  if (data.type === 'error' || data.type === 'peer-left') throw new Error(data.message);
  if (!ready) throw new Error('连接服务返回了无效消息');
  if (data.type === 'peer-ready') {
    status('正在连接朋友', '正在尝试建立加密文件连接。');
    connectTimer = setTimeout(() => fail(new Error('连接超时，请换个网络或检查中继配置')), 60_000);
    if (role === 'host') {
      setupChannel(peer.createDataChannel('frienddrop', { ordered: true }));
      await peer.setLocalDescription(await peer.createOffer()); signal({ type: 'offer', sdp: peer.localDescription.sdp });
    }
  } else if (data.type === 'offer' || data.type === 'answer') {
    await peer.setRemoteDescription({ type: data.type, sdp: data.sdp });
    for (const candidate of pendingCandidates) await peer.addIceCandidate(candidate);
    pendingCandidates = [];
    if (data.type === 'offer') { await peer.setLocalDescription(await peer.createAnswer()); signal({ type: 'answer', sdp: peer.localDescription.sdp }); }
  } else if (data.type === 'candidate') {
    if (peer.remoteDescription) await peer.addIceCandidate(data.candidate);
    else { if (pendingCandidates.length >= 100) throw new Error('连接候选过多'); pendingCandidates.push(data.candidate); }
  }
}
function connect(id, key, side) {
  role = side;
  const url = new URL(`${base}/api/rooms/${id}/socket`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(url);
  connectTimer = setTimeout(() => fail(new Error('连接服务没有响应，请稍后重试')), 15_000);
  socket.addEventListener('open', () => { clearTimeout(connectTimer); signal({ type: 'auth', role, token: key }); connectTimer = setTimeout(() => fail(new Error('连接认证超时')), 15_000); });
  socket.addEventListener('message', event => {
    signalQueue = signalQueue.then(async () => {
      const data = JSON.parse(event.data);
      if (data.type === 'authenticated') clearTimeout(connectTimer);
      await handleSignal(data);
    }).catch(fail);
  });
  socket.addEventListener('close', () => { if (!terminal) fail(new Error('邀请已失效，或连接服务已断开，请重新创建邀请')); });
  socket.addEventListener('error', () => fail(new Error('无法连接服务，请检查网络或邀请是否有效')));
  show('cancel');
}
async function choose(file) {
  if (!file || selected || terminal) return;
  try {
    fileInfo(file); selected = file; show('pick-panel', false); status('正在创建邀请', '马上就好。');
    const response = await fetch(`${base}/api/rooms`, { method: 'POST', signal: AbortSignal.timeout(12_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '无法创建邀请');
    const link = new URL(location.href); link.hash = new URLSearchParams({ room: data.id, key: data.guest }).toString();
    $('invite').value = link.href; show('invite-panel'); status('等朋友来接收', '复制链接，通过你常用的聊天工具发给朋友。');
    connect(data.id, data.host, 'host');
  } catch (error) { fail(error); }
}
$('pick').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => void choose($('file').files[0]));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('invite').value); $('copy').textContent = '已复制'; }
  catch { $('invite').focus(); $('invite').select(); $('copy').textContent = '请手动复制'; }
});
$('join').addEventListener('click', () => {
  show('join-panel', false);
  if (!/^[a-f0-9-]{36}$/.test(invite.get('room') || '') || !/^[a-f0-9]{64}$/.test(invite.get('key') || '')) return fail(new Error('邀请链接不完整，请让朋友重新发送'));
  status('正在连接朋友', '请让朋友保持发送页面打开。'); connect(invite.get('room'), invite.get('key'), 'guest');
  history.replaceState(null, '', location.pathname + location.search);
});
$('accept').addEventListener('click', async () => {
  const current = generation; $('accept').disabled = true;
  try {
    const target = await createSink(metadata);
    if (current !== generation || terminal) { await target.abort(); return; }
    sink = target; channel.removeEventListener('message', offer);
    transfer = new Transfer(channel, { meta: metadata, sink, onProgress: progress, onComplete: complete, onError: fail });
    lastTime = performance.now(); progress(0); transfer.accept();
  } catch (error) { if (error.name !== 'AbortError') fail(error); }
  finally { $('accept').disabled = false; }
});
$('cancel').addEventListener('click', () => { generation++; fail(new Error('你取消了这次传输')); });
$('reset').addEventListener('click', () => { peer?.close(); socket?.close(); location.assign(location.pathname); });
$('clear').addEventListener('click', async () => {
  try { await saved.remove(); saved = null; show('download-panel', false); show('reset'); status('临时文件已清理', '保存在设备上的副本不受影响。'); }
  catch { $('error').textContent = '临时文件暂时无法清理，请稍后重试'; show('error'); }
});
document.addEventListener('dragover', event => { event.preventDefault(); if (!invited && !selected && !terminal) document.querySelector('.transfer-card').classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.querySelector('.transfer-card').classList.remove('dragging'); });
document.addEventListener('drop', event => {
  event.preventDefault(); document.querySelector('.transfer-card').classList.remove('dragging');
  if (!invited && !selected && !terminal) {
    if (event.dataTransfer.files.length > 1) { $('error').textContent = '一次请选择一个文件'; show('error'); return; }
    show('error', false); void choose(event.dataTransfer.files[0]);
  }
});
window.addEventListener('beforeunload', event => { if ((selected && !terminal) || active || saved) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { peer?.close(); socket?.close(); if (transfer && !transfer.stopped) transfer.cancel(); });
if (invited) { show('pick-panel', false); show('join-panel'); status('朋友在等你', '点击连接，查看朋友要发来的文件。'); }
if (!window.isSecureContext || !window.RTCPeerConnection) fail(new Error('请使用支持 WebRTC 的浏览器，通过 HTTPS 打开网页'));
void cleanOldFiles().catch(() => {});
