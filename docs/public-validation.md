# 公网部署记录

日期：2026-11-04（America/Chicago）。用户已明确批准合并预览并部署 GitHub Pages、公网信令和 TURN。

- 页面：https://shuaigaodada.github.io/FriendDrop/
- 信令：https://frienddrop.laogao0113.workers.dev
- 仓库：https://github.com/Shuaigaodada/FriendDrop
- 已上线源码：`c459fbf`；Pages workflow run `41887620995` 成功。
- Worker version：`6285d212-9609-4983-a0b9-c727076280f0`。
- 合并前 main/回滚点：`1ee139d81cb8d7b317f1db040b1cce599f5e9256`；任务分支原基线 `0f2ccb8`。无原有远端，新建本项目专用公开仓库。main 快进到 `c459fbf` 后推送，跟踪 origin/main。

## 已验证

`npm test` 12/12、`npm run check` 通过。线上实际 Worker/DO 的 `npm run test:service` 2/2 通过，覆盖来源限制、鉴权、双人配对、错误 token、第三人拒绝、信令往返、非法消息和断线房间失效。运行时设置 FRIENDDROP_TEST_API 为上述信令地址、FRIENDDROP_TEST_ORIGIN 为 https://shuaigaodada.github.io。

Playwright 在 GitHub Pages 上实际传输 8,388,645 字节，路线显示 P2P 直连；双端确认码相同、OPFS 清理成功、页面错误为零、下载后 SHA-256 与源文件一致：`331aca13269b9f539ba59cc816e10f0d3be12ef5f9b7b5a37e5a804b5b1c80e6`。两个浏览器页面在同一台电脑，此结果不代表中美网络实测。

## TURN 配置与实测完成

Wrangler OAuth 的 TURN keys API 返回 HTTP 403，因此用户在 Cloudflare Realtime TURN 控制台创建 FriendDrop key，通过本机隐藏输入窗口提交 TURN_KEY_ID 和 TURN_API_TOKEN 到 Worker secrets。密钥仅经进程内存和 stdin 提交，未写进网页、聊天、仓库或本地明文文件。

配置后，线上服务测试 FRIENDDROP_TEST_RELAY=true 通过 2/2。Playwright 在 GitHub Pages 上用 `?relay-test=1` 运行测试脚本，两个客户端均覆盖 iceTransportPolicy 为 relay，真实传输 8,388,645 字节。路线显示「已连接 · 加密中继」，双端确认码相同、临时文件清理成功、页面错误为零。下载文件与源文件 SHA-256 均为 `331aca13269b9f539ba59cc816e10f0d3be12ef5f9b7b5a37e5a804b5b1c80e6`。普通网页仍优先直连，查询参数只供测试脚本识别，不改变生产网页策略。此测试是同一电脑经公网 TURN 中继，不代表中美线路实测。

官方费用核对：Realtime SFU/TURN 共享每月 1,000 GB 免费出站额度，超额 $0.05/GB；不是费用硬上限。未主动升级或绑卡。跨国线路、手机 3 GB、线上 3 GB 尚未验证。本机 3 GB 的历史验证见 validation.md。

本次已读 E:/Projects/AI-WORKFLOW.md、E:/Projects/vibecoding/CHANNEL.md、根 AGENT.md/CLAUDE.md、会话给定根 AGENTS.md、docs/deployment.md、docs/validation.md；目标项目无额外入口。任务目录 E:/Projects/vibecoding/_worktrees/FriendDrop/codex-web，分支 codex/web。日志 D:/Projects/logs/FriendDrop/；截图与下载验证文件 D:/Projects/FriendDrop/。无运行数据迁移。协作 inbox 检查为空。
