async (page) => {
  const context = page.context();
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', {value:undefined,configurable:true}));
  const sender = await context.newPage(), receiver = await context.newPage();
  const errors=[]; for(const tab of [sender,receiver]) tab.on('pageerror', e=>errors.push(e.message));
  const sessions = await Promise.all([context.newCDPSession(sender),context.newCDPSession(receiver)]);
  const peaks=[{usedSize:0,backingStorageSize:0},{usedSize:0,backingStorageSize:0}];
  let samples=0;
  const timer=setInterval(async()=>{
    try { const rows=await Promise.all(sessions.map(s=>s.send('Runtime.getHeapUsage'))); samples++;
      rows.forEach((r,i)=>{peaks[i].usedSize=Math.max(peaks[i].usedSize,r.usedSize);peaks[i].backingStorageSize=Math.max(peaks[i].backingStorageSize,r.backingStorageSize||0);});
    }catch{}
  },1000);
  try {
    await sender.goto('http://127.0.0.1:8787');
    await sender.locator('#file').setInputFiles('D:/Projects/FriendDrop/fixtures/three-gb.bin');
    await sender.locator('#invite-panel').waitFor({state:'visible'});
    await receiver.goto(await sender.locator('#invite').inputValue());
    await receiver.locator('#join').click(); await receiver.locator('#accept-panel').waitFor({state:'visible',timeout:30000});
    const start=Date.now(); await receiver.locator('#accept').click();
    await Promise.race([
      receiver.locator('#download-panel').waitFor({state:'visible',timeout:600000}),
      receiver.locator('#error').waitFor({state:'visible',timeout:600000}).then(async()=>{throw new Error(await receiver.locator('#error').textContent());}),
    ]);
    await sender.getByRole('status').filter({hasText:'朋友已收到'}).waitFor({timeout:10000});
    const seconds=(Date.now()-start)/1000;
    const downloading=receiver.waitForEvent('download',{timeout:60000}); await receiver.locator('#download').click();
    const download=await downloading; await download.saveAs('D:/Projects/FriendDrop/received-three-gb.bin');
    await receiver.screenshot({path:'D:/Projects/FriendDrop/preview-three-gb.png',fullPage:true});
    await receiver.locator('#clear').click(); await receiver.getByRole('status').filter({hasText:'临时文件已清理'}).waitFor();
    if(errors.length)throw new Error(errors.join(';'));
    return {size:3000000000,seconds,MBps:3000/seconds,heapPeaks:peaks,samples,errors};
  } finally { clearInterval(timer); await sender.close(); await receiver.close(); }
}
