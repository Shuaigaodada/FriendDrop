# FriendDrop

朋友之间通过浏览器进行 P2P 文件传输。单个文件最大 3,000,000,000 字节。当前为本地预览，尚未发布。

## 本地启动

需要 Node.js 24+。在此工作树执行：

```powershell
npm ci
npm run dev
```

打开 http://127.0.0.1:8787 ，选文件，把链接粘贴到同机另一个浏览器窗口，点击连接并接收。预览只监听本机，链接不能发给外网朋友。`Ctrl+C` 停止。

本机 Node 信令仅用于预览，所有文件数据仍通过真实 WebRTC 连接；不是模拟进度。预览不提供 TURN。Cloudflare 信令代码位于 `server/worker.ts`，`npm run dev:worker` 可尝试运行它；本机 workerd 存在启动错误，不能把 Node 预览结果当成 Worker 验证通过。

## 使用边界

- 接收方确认后才发送；每块 SHA-256 校验并写入成功后确认进度，全部写入关闭后才完成。
- 桌面支持文件写入选择器时直接写入选定位置；否则写入浏览器 OPFS，完成后点击“保存文件”。OPFS 路径不把整个文件聚合进 JavaScript 内存。
- 双方保持网页打开。手机后台、锁屏、断网可能中断，第一版不支持断点续传。
- 邀请 15 分钟内有效、仅限两人、使用后不能再次加入；会话最长 4 小时。
- 链接是访问凭证，只发给朋友；通过聊天核对双方确认码。P2P 连接会向对方暴露网络地址。
- 刷新前保存接收文件。临时文件可手动清理；下次打开页面清理超过 24 小时的临时文件。
- 直连失败需要可用 TURN。3 GB 手机接收、中美实网和 TURN 尚须单独验收。

## 检查

```powershell
npm test
npm run check
# 先启动 npm run dev
npm run test:service
npx playwright-cli -s=frienddrop open http://127.0.0.1:8787 --browser=chrome
npx playwright-cli -s=frienddrop run-code --filename tests/browser-smoke.js
```

浏览器脚本依赖 `D:/Projects/FriendDrop/fixtures/中文测试.bin`（8 MiB + 37 字节，字节 i 为 i % 251）；`node scripts/make-fixture.mjs` 生成独立 3 GB 测试文件及预期哈希。3 GB 测试应使用普通持久浏览器上下文：先执行 `npx playwright-cli -s=frienddrop-large open http://127.0.0.1:8787 --browser=chrome --persistent --profile=D:/Projects/FriendDrop/browser-profile`，再执行 `npx playwright-cli -s=frienddrop-large run-code --filename tests/browser-large.js`。无痕模式可能在约 2 GB 触发实际配额上限，即使预估额度看起来足够。这些脚本会传输和下载真实文件，不是网络性能基准。

运行日志：`D:/Projects/logs/FriendDrop/`。普通测试输出：`D:/Projects/FriendDrop/`。浏览器与第三方工具内部数据保持工具支持的位置。云平台日志保留在 Cloudflare，不记录文件内容、邀请密钥或 TURN 凭证。

发布步骤见 [部署说明](docs/deployment.md)，设计和实现记录见 [设计](docs/design.md)、[计划](docs/implementation.md) 和 [验证记录](docs/validation.md)。
