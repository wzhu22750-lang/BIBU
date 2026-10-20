# BIBU！工作区规则

## 1. 图标一律用矢量 SVG

所有图标与装饰走项目内的 SVG 方案，界面里出现的是矢量图形：

- 优先复用现成组件：`src/components/PixelArt.tsx` 的 `Icon`、`src/components/EventArt.tsx`、`src/lib/pet/wardrobeAssets.tsx`、`pixelarticons`
- 缺图标就手写 SVG，沿用像素风：`viewBox` + `shapeRendering="crispEdges"` + 硬边缘色块
- 文案里需要符号时用 SVG 或纯文本（例如 `♥`、`→`、`×`），不要用 emoji 字符

**完成标准**：本次改动涉及的所有图标都能在 DOM 里找到对应的 `<svg>` 或已有图标组件（本条只约束应用界面，README 等对外宣传文档可以正常用 emoji）。

## 2. APK 走热更新与打包规范

`capacitor.config.json` 的 `server.url` 指向生产站点 `https://www.515171.xyz`，APK 启动即加载线上最新前端。

- 改网页 → 推送 `main` → Vercel 部署 → APK 打开就是新版，不重新打包
- 修改 `capacitor.config.json` 后，确认 `server` 段仍在且 `server.url` 未变
- 只有原生层（Kotlin 插件、权限、图标、原生桌面微件）改动才需要重新打包 APK
- **APK 打包规范**：打包统一执行 `npm run android:build`（或在打包后执行 `node scripts/export-apk.mjs`）。该脚本会自动将最新 APK 导出至用户桌面（`~/Desktop/BIBU.apk`）与根目录 `dist-apk/BIBU.apk`，并在 macOS 访达中自动弹窗并高亮选中，方便用户直接拖拽至微信发送给手机，免除在深层目录翻找。

**完成标准**：`capacitor.config.json` 中 `server.url === "https://www.515171.xyz"`，且打出的 APK 已导出到桌面 `~/Desktop/BIBU.apk`。

## 3. Supabase 改动直连线上库自己改

线上项目 ref `zqwzdoejxsfscisudacu`，`supabase/.temp/access-token` 里的 `sbp_` token 能直接执行 SQL。要加迁移、改函数、修数据就自己接上去做完，不停在「请你去 Dashboard 执行」。

```bash
# 每次调用在独立子 shell 中运行；临时目录只属于本次 SQL 提交。
(
  set -eu
  umask 077
  QUERY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bibu-sql.XXXXXX")
  trap 'rm -f "$QUERY_DIR/query.json"; rmdir "$QUERY_DIR"' EXIT
  TOKEN=$(tr -d '\n' < supabase/.temp/access-token)
  MIGRATION_FILE="supabase/migrations/<file>.sql"
  node -e 'const fs=require("fs");fs.writeFileSync(process.argv[2],JSON.stringify({query:fs.readFileSync(process.argv[1],"utf8")}),{mode:0o600})' "$MIGRATION_FILE" "$QUERY_DIR/query.json"
  curl --fail-with-body -sS -w '\nhttp=%{http_code}\n' -X POST \
    "https://api.supabase.com/v1/projects/zqwzdoejxsfscisudacu/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @"$QUERY_DIR/query.json"
)
```

- 仅执行本次任务授权的线上变更；只读审计不执行 SQL。提交前核对项目 ref、迁移路径与内容。
- 迁移先落盘到 `supabase/migrations/`，再把同一份 SQL 整份执行到线上，两边始终同一份内容
- 当前工作区未配置直连 PG 密码，历史 `supabase db push` / `migration list` 出现 `LegacyDbConnectError`；在此条件下用上面的 Management API。凭据或 CLI 环境变化后重新核实，不把历史错误当作永久限制。
- DDL 之后补 `notify pgrst, 'reload schema'`，让 PostgREST 立刻认出新签名
- 校验新签名：核对线上 `pg_proc` 的参数、返回类型、函数定义及授权，并验证 PostgREST 是否解析到预期签名。anon 调用的 `42501 permission denied` 只作为权限拒绝的观察，不能单独证明定义正确或业务通过；`PGRST202` 需检查签名和 schema cache。对预期角色补充任务相关的行为验证。
- 删表、删数据这类不可逆操作先讲清影响再动手

**完成标准**：本次涉及的新迁移已在线上执行，且线上库函数签名/表结构与 `supabase/migrations/` 一致（核验 `pg_proc` 与授权，而不是只看 HTTP 201）。
