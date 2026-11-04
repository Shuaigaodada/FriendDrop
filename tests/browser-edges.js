async (page) => {
  const target = new URL(page.url()); target.search = '';
  const results=[];
  for(const scenario of ['empty','quota','cancel','sender-close','receiver-close']) {
    const context=await page.context().browser().newContext({acceptDownloads:true});
    await context.addInitScript(() => Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
    await context.addInitScript(() => {
      const Native = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Native {
        constructor(config) { super({...config, iceServers: config.iceServers.filter(s => [s.urls].flat().every(u => u.startsWith('stun:')))}); }
      };
      const write = FileSystemWritableFileStream.prototype.write;
      FileSystemWritableFileStream.prototype.write = async function(data) {
        await new Promise(resolve => setTimeout(resolve, 20)); return write.call(this, data);
      };
    });
    const sender=await context.newPage(),receiver=await context.newPage();
    try {
      if(scenario==='quota')await receiver.addInitScript(()=>{navigator.storage.estimate=async()=>({quota:1,usage:0});});
      await sender.goto(target.href);
      await sender.locator('#file').setInputFiles(`D:/Projects/FriendDrop/fixtures/${scenario==='empty'?'empty.txt':scenario==='quota'?'中文测试.bin':'cancel-test.bin'}`);
      await sender.locator('#invite-panel').waitFor({state:'visible'});
      await receiver.goto(await sender.locator('#invite').inputValue()); await receiver.locator('#join').click();
      await receiver.locator('#accept-panel').waitFor({state:'visible',timeout:30000});
      await receiver.locator('#accept').click();
      if(scenario==='empty') {
        await receiver.locator('#download-panel').waitFor({state:'visible'});
        await sender.getByRole('status').filter({hasText:'朋友已收到'}).waitFor();
        if(await receiver.locator('#percent').textContent()!=='100%')throw new Error('Empty-file progress incorrect');
        await receiver.locator('#clear').click();
      } else if(scenario==='quota') {
        await receiver.locator('#error').waitFor({state:'visible'});
        if(!(await receiver.locator('#error').textContent()).includes('空间不足'))throw new Error('Quota failure not explained');
        await sender.locator('#error').waitFor({state:'visible'});
      } else {
        await receiver.waitForFunction(()=>document.getElementById('bytes').textContent.match(/^[1-9].*MB/),{},{timeout:30000});
        if (scenario === 'receiver-close') {
          await receiver.close(); await sender.locator('#error').waitFor({state:'visible',timeout:20000});
          if(await sender.getByRole('status').textContent()==='朋友已收到')throw new Error('Disconnected transfer marked complete');
          results.push({scenario,passed:true}); continue;
        }
        if (scenario === 'sender-close') await sender.close();
        else await sender.locator('#cancel').click();
        await receiver.locator('#error').waitFor({state:'visible',timeout:20000});
        await receiver.waitForFunction(async()=>{
          const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('frienddrop');return (await Array.fromAsync(dir.keys())).length===0;
        },{},{timeout:10000});
        if(!sender.isClosed() && await sender.getByRole('status').textContent()==='朋友已收到')throw new Error('Cancelled transfer marked complete');
      }
      results.push({scenario,passed:true});
    } finally {await context.close();}
  }
  const rollback=await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory(); const key='frienddrop-rollback-test';
    const handle=await root.getFileHandle(key,{create:true});const original=await handle.createWritable();await original.write('original');await original.close();
    const previous=window.showSaveFilePicker;
    Object.defineProperty(window,'showSaveFilePicker',{value:async()=>handle,configurable:true});
    try {
      const {createSink}=await import('./storage.js'); const sink=await createSink({name:'x',size:3});await sink.write(new TextEncoder().encode('new'));await sink.abort();
      return await(await handle.getFile()).text();
    } finally {Object.defineProperty(window,'showSaveFilePicker',{value:previous,configurable:true});await root.removeEntry(key);}
  });
  if(rollback!=='original')throw new Error('Cancelled direct write damaged existing content');
  results.push({scenario:'direct-write-abort-preserves-existing-file',passed:true,picker:'test substitute; real file handle'});
  return results;
}
