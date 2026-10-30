# 发布到 GitHub Pages + Cloudflare

本文件是准备好的发布步骤；未执行创建远端、推送、上线或启用付费。先验收预览并确认发布，再执行。`server/local.mjs` 只服务本机预览，不能拿它当成已上线的信令。

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
