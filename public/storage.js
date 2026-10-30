export async function createSink(meta) {
  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({ suggestedName: meta.name.replace(/[\\/:*?"<>|]/g, '_') });
    // Abort rolls back writes; the browser confirms an existing target before replacement.
    const writer = await handle.createWritable();
    return { write: data => writer.write(data), close: async () => { await writer.close(); return { direct: true }; }, abort: () => writer.abort() };
  }
  if (!navigator.storage?.getDirectory) throw new Error('此浏览器不支持大文件保存，请使用电脑 Chrome 或 Edge');
  const { quota, usage } = await navigator.storage.estimate();
  if (typeof quota !== 'number' || typeof usage !== 'number' || quota - usage < meta.size * 1.1 + 10_000_000) throw new Error('浏览器可用空间不足，请清理空间或改用电脑 Chrome / Edge');
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle('frienddrop', { create: true });
  const key = `${Date.now()}-${crypto.randomUUID()}`;
  const handle = await dir.getFileHandle(key, { create: true });
  let writer;
  try {
    if (typeof handle.createWritable !== 'function') throw new Error('此浏览器不支持流式保存，请使用电脑 Chrome 或 Edge');
    writer = await handle.createWritable();
  } catch (error) { await dir.removeEntry(key); throw error; }
  let url;
  const remove = async () => { if (url) URL.revokeObjectURL(url); await dir.removeEntry(key); };
  return {
    write: data => writer.write(data),
    close: async () => {
      await writer.close();
      // File-backed object URL: never gather the entire transfer into a JS Blob.
      const file = await handle.getFile();
      url = URL.createObjectURL(file);
      return { direct: false, url, name: meta.name, remove };
    },
    abort: async () => { try { await writer.abort(); } finally { await remove(); } },
  };
}

export async function cleanOldFiles() {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  let dir;
  try { dir = await root.getDirectoryHandle('frienddrop'); } catch { return; }
  for await (const [name] of dir.entries()) {
    const time = Number(name.split('-')[0]);
    if (Number.isFinite(time) && Date.now() - time > 24 * 60 * 60_000) await dir.removeEntry(name);
  }
}
