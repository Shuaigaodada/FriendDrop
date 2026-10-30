# 本地预览交付与验证

日期：2026-10-30（America/Chicago）。代码提交：`f98e3b5b14a7050b4fec2068c740cd542eb61952`。

## 已实现

静态网页、双人邀请、接收确认、P2P 文件分块传输、SHA-256 分块校验、落盘回执、进度和速度、取消与错误处理、OPFS 保存和清理、连接确认码、单次邀请与信令限流。GitHub Pages 手动发布工作流、Cloudflare Worker 和可选短期 TURN 凭证路径已准备。

预览地址：http://127.0.0.1:8787 。只监听本机，朋友不能从外网访问这个链接。通过 `npm run dev` 启动的 Node 信令运行；不是已部署 Worker。

## 实际检查

| 检查 | 结果 |
| --- | --- |
| `npm test` | 12/12 通过：元数据边界、3 GB 上限、空文件、分块哈希、损坏数据、异常回执、写盘失败、取消、异常清理、信令角色和部署 origin 校验 |
| `npm run check` | TypeScript 通过 |
| `npm run test:service` | 2/2 通过，针对本机 Node 信令：来源限制、双人鉴权、错误凭证、第三人拒绝、信令往返、非法消息和房间断开 |
| `tests/browser-smoke.js` | Chrome 两个页面真实 WebRTC 直连，8,388,645 字节中文名文件，保存后完整 SHA-256 一致；确认码一致、OPFS 清理成功，无页面异常 |
| `tests/browser-edges.js` | 空文件、模拟空间不足、真实传输中取消及临时文件清理通过；模拟保存选择器返回真实文件句柄，取消写入保留原内容 |
| `tests/browser-large.js` | 普通持久 Chrome 上下文真实传输 3,000,000,000 字节，OPFS 接收、导出下载、全文件哈希和临时清理通过；无页面异常 |
| 响应式预览 | 1280×900 和 390×844 截图检查；手机宽度无横向溢出。不是手机设备验收 |
| `npx wrangler deploy --dry-run` | 通过，未上传或部署 |
| Pages 构建 | 用测试 HTTPS origin 生成 dist/config.js，通过；这是构建检查，测试域名不是上线地址 |
| `npm audit` | 0 vulnerabilities（当次完整依赖审计） |
| `git diff --cached --check` | 通过 |

8 MiB + 37 字节源文件及导出 SHA-256：
`331aca13269b9f539ba59cc816e10f0d3be12ef5f9b7b5a37e5a804b5b1c80e6`

3 GB 源文件及导出 SHA-256：
`41809dd780b7501937d8bd88230bb13f3de2290ff45e4ae867fe9ec0b2473b92`

3 GB 本机传输阶段耗时 203.796 秒（约 14.72 MB/s，不含后续导出保存时间），不是跨国网速指标。CDP 每秒采样共 308 次：发送页面 JS usedSize 峰值 2,692,220 字节、backingStorageSize 峰值 48,261,370 字节；接收页面分别为 4,430,036 与 69,234,966 字节。这些是 V8 指标，不是浏览器进程总 RSS，也不包含所有原生缓存。

3 GB 运行期间仅追加状态文案更新去重、存储方法不可用时的报错和辅助说明；文件传输算法未变。最新源文件随后通过 8 MiB 全流程复测。直接操作 Windows 原生保存对话框尚未自动验证；大文件实测走真实 OPFS 与下载路径。

## 发现的限制与未通过项

- 首次 3 GB 测试使用隐私浏览上下文，约 2.10 GB 时实际写入触发 QuotaExceededError，而预估 quota 约 10 GB。失败未误报成功，并清理临时文件。补充了退出无痕模式的提示及中文报错。普通持久上下文随后完整通过。
- Wrangler 4.156.0 / workerd 1.20261023.1 在本机启动时报 `CreateDirectory: #5 拒绝访问`（miniflare-email-store / CacheObject）。换临时与持久化目录未解决；短暂尝试旧工具链后又出现运行时退出，已经恢复最新锁定版本，未改系统权限。
- 带 D 盘 outdir 的 dry-run 出现原生构建文件写入失败；不指定 outdir 的正式 dry-run 成功。未宣称修复原生环境问题。
- Cloudflare Worker 仅完成类型与打包检查，尚未在实际 runtime 中跑集成测试。Node 预览有明确用途注释，共用信令校验，但不能替代 Worker 验证。
- 未配置 TURN 账户，未实测强制中继、中美线路、手机 3 GB、其他浏览器、15 分钟/4 小时真实计时边界与长时间稳定性。
- 未创建远端仓库、未推送、未部署、未启用任何付费服务；没有公网可分享链接。第一版没有断点续传。

## 工程与交付状态

- 源仓库 `E:/Projects/FriendDrop`；任务目录 `E:/Projects/vibecoding/_worktrees/FriendDrop/codex-web`；分支 `codex/web`。
- 初始 Git 回滚点 `1ee139d81cb8d7b317f1db040b1cce599f5e9256`；设计基线 `7c2fede`。无远端，因此未 fetch/pull。
- 已读取根 AGENTS（会话提供）、`E:/Projects/AI-WORKFLOW.md`、`E:/Projects/vibecoding/CHANNEL.md`、根 `AGENT.md`、`CLAUDE.md`；新项目无其他原有入口。技能：brainstorming、using-superpowers 与 Codex 参考、ponytail、Sites 与 local preview 参考、frontend-design、cloudflare、durable-objects 与 rules 参考、workers-best-practices、wrangler、playwright、diagnosing-bugs。writing-plans 缺失，用户明确允许跳过并直接实现。
- 改动分布：public 为页面与传输/保存；server 为云端和本机信令；scripts 为启动、静态打包与测试数据；tests 为边界、服务和浏览器验证；GitHub workflow 为手动 Pages 发布；docs 为范围、部署和验证。
- UI 预览已提供，尚未获用户 UI 验收决定，未合并 main；main 仍是初始提交。没有运行数据迁移，不需要运行数据备份；不保留回滚目录副本。
- 日志 `D:/Projects/logs/FriendDrop/`；截图与测试记录 `D:/Projects/FriendDrop/`。3 GB 测试文件可由脚本重新生成，验证后清理其输入与导出副本，保留哈希记录和截图。
- 协调收件使用 `codex-p2p-transfer`，检查为空；没有发出任何对外消息。
