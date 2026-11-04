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

## TURN 待配置

Wrangler 登录已刷新，部署成功；该 OAuth 的 TURN keys API 返回 HTTP 403，未创建 TURN key、未配置 Worker secrets。已请用户在 Cloudflare Realtime TURN 控制台创建 FriendDrop key，不能将密钥写进聊天、仓库或日志。尚未通过强制 relay 测试，不应宣称中继已就绪。

测试脚本已支持目标页面 URL 和 `?relay-test=1` 强制中继；服务测试用 FRIENDDROP_TEST_RELAY=true 检查已发放 TURN 配置。配置后仍须真实传输并核对 route 与文件哈希。

官方费用核对：Realtime SFU/TURN 共享每月 1,000 GB 免费出站额度，超额 $0.05/GB；不是费用硬上限。未主动升级或绑卡。跨国线路、手机 3 GB、线上 3 GB 尚未验证。本机 3 GB 的历史验证见 validation.md。

本次已读 E:/Projects/AI-WORKFLOW.md、E:/Projects/vibecoding/CHANNEL.md、根 AGENT.md/CLAUDE.md、会话给定根 AGENTS.md、docs/deployment.md、docs/validation.md；目标项目无额外入口。任务目录 E:/Projects/vibecoding/_worktrees/FriendDrop/codex-web，分支 codex/web。日志 D:/Projects/logs/FriendDrop/；截图与下载验证文件 D:/Projects/FriendDrop/。无运行数据迁移。协作 inbox 检查为空。
