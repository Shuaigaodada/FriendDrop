# 公网部署记录

日期：2026-11-04（America/Chicago）。用户已明确批准合并预览并部署 GitHub Pages、公网信令和 TURN。

- 页面：https://shuaigaodada.github.io/FriendDrop/
- 信令：https://frienddrop.laogao0113.workers.dev
- 仓库：https://github.com/Shuaigaodada/FriendDrop
- 已上线源码：`c459fbf`；Pages workflow run `41887620995` 成功。
- Worker version：`6285d212-9609-4983-a0b9-c727076280f0`。
- 费用保护更新：源码 `5b32d9b`，Worker version `731ae074-7a1e-497c-8c90-6b357be3b26b`；更新前回滚点 `85ac135`。页面静态资源未变，不需要重发 Pages。
- 合并前 main/回滚点：`1ee139d81cb8d7b317f1db040b1cce599f5e9256`；任务分支原基线 `0f2ccb8`。无原有远端，新建本项目专用公开仓库。main 快进到 `c459fbf` 后推送，跟踪 origin/main。

## 已验证

`npm test` 12/12、`npm run check` 通过。线上实际 Worker/DO 的 `npm run test:service` 2/2 通过，覆盖来源限制、鉴权、双人配对、错误 token、第三人拒绝、信令往返、非法消息和断线房间失效。运行时设置 FRIENDDROP_TEST_API 为上述信令地址、FRIENDDROP_TEST_ORIGIN 为 https://shuaigaodada.github.io。

Playwright 在 GitHub Pages 上实际传输 8,388,645 字节，路线显示 P2P 直连；双端确认码相同、OPFS 清理成功、页面错误为零、下载后 SHA-256 与源文件一致：`331aca13269b9f539ba59cc816e10f0d3be12ef5f9b7b5a37e5a804b5b1c80e6`。两个浏览器页面在同一台电脑，此结果不代表中美网络实测。

## TURN 配置与实测完成

Wrangler OAuth 的 TURN keys API 返回 HTTP 403，因此用户在 Cloudflare Realtime TURN 控制台创建 FriendDrop key，通过本机隐藏输入窗口提交 TURN_KEY_ID 和 TURN_API_TOKEN 到 Worker secrets。密钥仅经进程内存和 stdin 提交，未写进网页、聊天、仓库或本地明文文件。

配置后，线上服务测试 FRIENDDROP_TEST_RELAY=true 通过 2/2。Playwright 在 GitHub Pages 上用 `?relay-test=1` 运行测试脚本，两个客户端均覆盖 iceTransportPolicy 为 relay，真实传输 8,388,645 字节。路线显示「已连接 · 加密中继」，双端确认码相同、临时文件清理成功、页面错误为零。下载文件与源文件 SHA-256 均为 `331aca13269b9f539ba59cc816e10f0d3be12ef5f9b7b5a37e5a804b5b1c80e6`。普通网页仍优先直连，查询参数只供测试脚本识别，不改变生产网页策略。此测试是同一电脑经公网 TURN 中继，不代表中美线路实测。

官方费用核对：Realtime SFU/TURN 共享每月 1,000 GB 免费出站额度，超额 $0.05/GB；不是费用硬上限。未主动升级或绑卡。跨国线路、手机 3 GB 尚未验证；线上页面 3 GB 直传追加验证见下。本机 3 GB 的历史验证见 validation.md。

本次已读 E:/Projects/AI-WORKFLOW.md、E:/Projects/vibecoding/CHANNEL.md、根 AGENT.md/CLAUDE.md、会话给定根 AGENTS.md、docs/deployment.md、docs/validation.md；目标项目无额外入口。任务目录 E:/Projects/vibecoding/_worktrees/FriendDrop/codex-web，分支 codex/web。日志 D:/Projects/logs/FriendDrop/；截图与下载验证文件 D:/Projects/FriendDrop/。无运行数据迁移。协作 inbox 检查为空。

## 费用保护与追加测试（2026-11-04）

用户明确选择「保留 TURN，加保守限额和自动停用，但接受无法保证零超额费用」。实现每 UTC 月 40 个邀请的持久化中继资格上限，具体边界见 deployment.md。不是基于实际账单的 480 GB 硬停，也不是禁止 Cloudflare 自动扣费。已发凭证最多 5 小时有效；配置为 0 只停止后续发放。

- 单元测试 14/14、TypeScript、Worker dry-run 通过；新增真实 SQLite 测试覆盖 40 个名额耗尽、重复请求、UTC 月切换、禁用和非法配置。
- 临时云端测试 Worker 使用生产 TurnBudget 类，以额度 2 接收 20 个并发请求，恰好 2 个通过；重复使用已获额度的房间通过，新房间和非法房间拒绝。测试服务 frienddrop-budget-test 已删除，未配置任何 TURN secrets。
- GitHub Pages 实际浏览器边界测试 6/6：空文件、模拟空间不足、128 MiB 文件传输中取消、发送页面关闭、接收页面关闭、取消直接写入保留原文件。最后一项使用真实文件句柄替代原生选择器，不代表 Windows 对话框已验证。该批次过滤 TURN 候选，仅测试直连。
- 发布后的线上信令集成 2/2，再次强制中继传输 8,388,645 字节成功，完整 SHA-256 与上文一致；双端确认码一致、临时文件清理成功、无页面异常。
- GitHub Pages + 线上信令的普通持久 Chrome 实际传输并保存 3,000,000,000 字节成功，P2P 直连，传输阶段 187.299 秒（同机测试约 16.02 MB/s）；JS usedSize 峰值发送 2,915,808 / 接收 4,097,740，backingStorageSize 峰值发送 58,754,303 / 接收 57,848,683 字节，非浏览器总 RSS。源文件和保存文件完整 SHA-256 一致：`41809dd780b7501937d8bd88230bb13f3de2290ff45e4ae867fe9ec0b2473b92`。传输使用更新前信令，文件协议及静态页面在本次更新中未改变。

限制：未实测中美跨国线路、真实手机 3 GB、3 GB 强制中继、真实断网恢复或 5 小时凭证过期。账号订阅查询返回 HTTP 403，未声称已核实全账号免费额度余额或其他项目消费，也未修改其他项目的账单设置。

