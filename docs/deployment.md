# 发布到 GitHub Pages + Cloudflare

页面和 Worker 已于 2026-11-04 上线，证据见 public-validation.md。以下是后续部署说明。`server/local.mjs` 只服务本机预览。

## 中继发放上限

用户选择保留 TURN，接受保守保护不能保证零费用。TURN_MONTHLY_ROOM_LIMIT=40：每个 UTC 自然月最多 40 个邀请获得中继凭证资格，发送和接收端共用一次名额；用完后新邀请只获 STUN，继续尝试 P2P。每月自然恢复。配置为 0 可停止新凭证发放；缺失、非整数或大于 40 均按停用处理。名额在独立 SQLite Durable Object 中持久化，不随 Worker 重启/部署清零；同一个月同一房间重复申请不重复计数。检查异常、签发失败均不退还名额，防止故障时超发。

这限制的是邀请数，不是 Cloudflare 实际账单流量。即使最后成功直连、未传文件或取消也会占名额。按每邀请预留 12 GB 粗估为 480 GB，但这不是流量硬上限：已签发凭证最长有效 5 小时、可能被复用，其他项目共享免费额度、月末跨界、协议开销和已有凭证也不能靠此计数覆盖。部署前已经签发的邀请不在新计数中。已开始的传输不会因额度耗尽被强制打断。不要删除 TURN_BUDGET 的持久数据来重置额度。

Cloudflare Spend Policies API 当前产品枚举仅 workers/durable_objects，未提供 TURN 的零费用硬停。未配置自动扣费禁止或声称已配置。参考：https://developers.cloudflare.com/api/resources/billing/subresources/spend_policies/methods/create/

## Cloudflare 信令

1. 使用自己的 Cloudflare 账户，先核对 Workers Free、SQLite Durable Objects 和 Realtime 免费额度。各产品独立计费；TURN 免费额度不是硬费用上限。没有批准费用前不要升级计划。
2. 把 `wrangler.jsonc` 的 `ALLOWED_ORIGINS` 改成 GitHub Pages 的 origin，例如 `https://yourname.github.io`，不包含 `/仓库名/`。如果还需本地测试，可保留本地两个 origin，以逗号分隔、不加空格。重新运行 `npm run types` 和 `npm run check`。
3. 配置 Wrangler 登录；执行 `npx wrangler deploy --dry-run`，确认后再 `npx wrangler deploy`。这一步才创建远端 Worker 和房间存储。当前本机 dry-run 可通过，但 workerd 本地启动失败，所以发布前仍需在可运行 workerd 的环境跑房间集成测试。
4. 默认没有 TURN，仅提供 STUN 和直连。需要兜底时在 Cloudflare Realtime 创建 TURN key，然后用交互命令分别设置 `TURN_KEY_ID` 和 `TURN_API_TOKEN`：`npx wrangler secret put TURN_KEY_ID`、`npx wrangler secret put TURN_API_TOKEN`。不要把 token 写进网页、仓库、命令参数或聊天。
5. 服务端每个参与者鉴权后签发短期凭证，有效期 5 小时，覆盖最长 4 小时会话及等待时间。签发失败明确退回仅直连。配置了凭证不等于已验证中继；必须强制 relay 实测和检查账户流量。

## GitHub Pages

1. 在用户选定的 GitHub 仓库推送已验收版本；不要自动使用已有无关仓库。当前项目没有远端。
2. 仓库 Settings → Pages → Source 选择 GitHub Actions。
3. 在仓库 Actions variables 设置 `FRIENDDROP_API_BASE`，值为刚部署的 Worker HTTPS origin，例如 `https://frienddrop.your-account.workers.dev`，不含凭证和额外路径。
4. 手动运行 `Publish FriendDrop Pages`。工作流只由 `workflow_dispatch` 触发，不会在每次 push 自动上线。它运行单元测试、类型检查，生成 `dist/config.js`，发布静态 `dist/`。
5. GitHub 项目子路径通过相对资源链接支持。网页只连接配置的 Worker，文件不会上传 GitHub。Pages 与 Worker 必须分别上线，只有 Pages 不足以实现邀请连接。

## 发布验收

从美国和中国各一台设备检查：页面可打开、信令能连接、直传成功；无法直连时中继成功；空文件、小文件、3 GB 的哈希一致。分别记录设备、浏览器、网络和选中的连接类型。关闭页面、取消、空间不足应报错并清理临时文件，不能显示成功。

仅访问账户或修改配置无法证明跨国可用。当前没有 TURN 实测、跨国测试或手机大文件验收。不要把本机速度当作中美速度。

参考：
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://developers.cloudflare.com/realtime/turn/generate-credentials/
- https://developers.cloudflare.com/realtime/sfu/platform/pricing/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
