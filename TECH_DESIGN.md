# 个人展示网站 · 技术设计文档（TECH_DESIGN）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 最后更新 | 2026-10-19 |
| 关联文档 | [PRD.md](./PRD.md) · [AGENTS.md](./AGENTS.md) |
| 部署目标 | Cloudflare Workers |
| 核心约束 | 零服务器运维、后台可改内容、深色星空视觉、多端适配 |

---

## 0. 一句话方案

**用 Astro 生成以静态 HTML 为主的站点，内容存在 Cloudflare D1，图片存在 Workers KV，读写接口跑在 Cloudflare Workers 运行时，后台单页应用挂 `/admin` 并由 Cloudflare Access 保护。没有服务器、没有容器、没有自建数据库。**

选型理由一句话版：个人站点是**读多写极少、内容量小、预算低**的场景，Cloudflare 这套组合把「运维」这一项直接消掉了，并且后台改完内容能即时生效——这正好命中我们选的「有后台可改内容」这条路线。

---

## 1. 技术栈选择

### 1.1 总览

| 层 | 选型 | 关键版本/形态 |
| --- | --- | --- |
| 前端框架 | **Astro**（`output: 'server'` + 岛屿） | 静态 HTML 为主，交互组件按需加载 JS |
| 前端语言 | **TypeScript**（`strict: true`） | 全项目统一，不允许 `any` |
| 样式 | **原生 CSS + 设计令牌（CSS 变量）** | 不引入 Tailwind / UI 组件库，保持极简依赖 |
| 交互岛屿 | **原生 TS**（星空、菜单、筛选）+ 少量 React（仅复杂表单） | 首页 JS 预算 < 80KB gzip |
| 后台前端 | **React 18 + Vite**（独立 SPA） | 独立构建产物，挂在 `/admin` |
| 后端 | **Cloudflare Workers 运行时** + **Hono** 路由（接口以 Astro endpoint 落地，见 §2.1 偏离说明） | 无服务器，`/api/*` |
| 校验 | **Zod** | 所有入参/出参运行时校验 |
| 数据库 | **Cloudflare D1**（SQLite） | 关系型内容存储 |
| 对象存储 | **Cloudflare Workers KV**（原计划 R2，见 §1.5 偏离说明） | 头像/封面/正文图 |
| 访问控制 | **Cloudflare Access**（Zero Trust） | 保护 `/admin` 与 `/api/admin/*` |
| Markdown | **unified**（remark-parse → remark-rehype → rehype-sanitize → rehype-stringify）+ **Shiki** 高亮 | 后台预览与线上渲染共用同一管线 |
| 构建/包管理 | **pnpm workspaces** | 单仓库多包 |
| 测试 | **Vitest**（单元）+ **Playwright**（端到端）+ **wrangler 本地 D1** | 见 AGENTS.md 测试要求 |
| 代码质量 | **ESLint + Prettier + tsc --noEmit** | CI 必过 |
| 部署 | **Cloudflare Workers**（Git 集成自动构建，即 Workers Builds）+ **wrangler** | 预览域名 `*.workers.dev` |

### 1.2 前端：为什么是 Astro + 原生 CSS

| 候选 | 评估 | 结论 |
| --- | --- | --- |
| **Astro** | 默认输出静态 HTML，只有交互组件加载 JS；对内容型站点（博客/项目展示）最贴合；岛屿模型天然契合「只有星空和表单需要 JS」 | **选用** |
| Next.js | 功能同样满足，但为了让后台改内容即时生效需要 SSR 或 ISR，产物与心智更重；SSR 下首屏 JS 明显更大 | 备选（若将来想要单一框架可迁移） |
| 纯静态 + 手写 HTML | 最轻，但博客列表/详情、标签聚合、RSS、分页都要手写构建脚本，重复造轮子 | 不选 |
| Vue/Nuxt | 生态可用，但本项目交互极少，收益不足以抵消额外依赖 | 不选 |

样式选原生 CSS 而非 Tailwind：本项目组件数量少（< 30 个），设计令牌体系（CSS 变量）已能把「统一调整」这件事做好，加一层工具链收益有限。**依赖越少，长期维护成本越低**——这是个人项目的关键取舍。

### 1.3 后端：为什么是 Cloudflare Workers 而不是独立服务器

| 候选 | 评估 | 结论 |
| --- | --- | --- |
| **Cloudflare Workers** | 与站点同源、同平台；`/api/*` 就近执行；静态资源与 Worker 打包成同一份产物一起部署；免费额度足够个人站；无需服务器与证书 | **选用** |
| 独立 Node 服务（VPS） | 需要买服务器、配 Nginx/证书、做进程守护与日志，运维成本与预算都超出个人站需要 | 不选 |
| Cloudflare Pages Functions | 与 Workers 同运行时，但 Cloudflare 已建议新项目直接用 Workers，且本项目用的适配器 v14 已移除 Pages 支持（见 §2.1 偏离说明） | 不选 |
| 无后端（纯静态） | 无法满足「后台改内容」这一核心需求 | 不选 |

**为什么不自己实现账号密码登录**：自建登录意味着密码哈希、会话管理、防爆破、找回流程全都要自己写，而这些正是最容易出安全问题的地方。Cloudflare Access 在边缘完成身份验证与访问放行，应用内不接触密码，风险面显著更小——这与 PRD 中「后台受访问控制保护」的要求一致。

### 1.4 数据库：为什么是 D1

| 候选 | 评估 | 结论 |
| --- | --- | --- |
| **Cloudflare D1（SQLite）** | 与 Pages 同平台零额外成本；关系型，适合本篇内容（项目/文章/标签的多对多）；SQL 标准，迁移路径清晰 | **选用** |
| Cloudflare KV | 键值存储，做不了「按标签筛选」「分页排序」这类查询 | 不选（可作为缓存层） |
| Postgres（Neon/Supabase） | 能力过剩；个人站数据量在千行级，还要多付一层外部依赖与网络往返 | 不选 |
| 纯 Markdown 文件 | 无法满足后台在线编辑 | 不选 |
| JSON 文件放对象存储（R2 / KV） | 无并发控制与查询能力，内容一多就难维护 | 不选 |

**数据量评估**：个人站典型规模为「文章数百篇、项目数十个、技能数十条」。D1 免费额度与性能对这样的规模是充足的，压力点主要在**读**，而读可以通过边缘缓存化解（见 §4.2）。

### 1.5 其他关键选型

- **图片存储用 Workers KV 而非把图片提交进仓库**：仓库体积不会随内容膨胀；KV 无需绑定银行卡即可启用（R2 需绑卡），免费额度（1GB 存储 / 10 万次读每天 / 1000 次写每天）对个人站图片量够用。
- **高亮用 Shiki 但限定语言集**：Workers 有 CPU 时间限制，只为常用语言（js/ts/json/html/css/bash/sql/python/md）注册语法，避免冷启动开销失控。
- **不用第三方统计与广告**：符合 PRD 的隐私要求；如需数据仅启用无 Cookie 的站点分析。

> **⚠️ 实现偏离（图片存储：R2 → Workers KV，已回写）**
>
> 原计划图片/对象存储用 **Cloudflare R2**；实际部署时发现 **R2 必须先绑定银行卡才能启用**，而本项目不打算绑卡，
> 故改用 **Workers KV**（绑定名仍为 `MEDIA`，只换后端实现，代码侧绑定名不变）。KV 免费额度无需绑卡
> （1GB 存储 / 10 万次读每天 / 1000 次写每天），对个人站图片量够用。已在本地跑通上传 / 读取 / 删除共 8 项端到端验证。
>
> **配置与代码落点**：
> - `wrangler.toml`：绑定由 `[[r2_buckets]]` 换成 `[[kv_namespaces]]`（namespace `portfolio-media`，id `1d7f23db431f4417a4f028187409244c`）。
> - 入口：`apps/web/src/lib/server/storage.ts` 的 `getMediaStore()`（原 `getMediaBucket()`）；读写 key 形态 `{yyyy}/{mm}/{uuid}.{ext}`，MIME 与原始文件名存 KV metadata。
> - 读取端点：`apps/web/src/pages/media/[...key].ts`（响应头 `content-type`、`cache-control: public, max-age=31536000, immutable`、`x-content-type-options: nosniff`）。
> - 上传顺序不变：**先写存储（KV）再写 `media` 表**，写库失败则回滚已上传对象，避免孤儿文件。
>
> **与 R2 的差异（已知代价）**：
> 1. 单值上限 25MiB（上传接口本就限制 5MB，不构成问题）。
> 2. 写入是**最终一致**的（全球同步约 60 秒）；缓解措施：key 含 uuid、内容永不覆写（同一位置写后读一致），读取端走 immutable 长缓存。
> 3. 宽高解析只支持 PNG / GIF（JPEG / WebP 解析变长段结构需引库，不值得；这两种返回 `null`，前端按默认宽高比预留空间）。

---

## 2. 项目结构

### 2.1 目录树

```
portfolio/
├─ PRD.md                     产品需求文档
├─ TECH_DESIGN.md             本文档
├─ AGENTS.md                  AI 开发规范
├─ package.json               工作区脚本（dev / build / test / migrate）
├─ pnpm-workspace.yaml
├─ wrangler.toml              D1/KV 绑定与环境变量声明（**不写 main/assets**，原因见 §5.2）
├─ tsconfig.base.json         共享 TS 配置（strict）
├─ .dev.vars.example          本地环境变量样例（真实值不进仓库）
│
├─ packages/
│   └─ shared/                跨端共享（前端、后台、Functions 都用）
│       ├─ src/types.ts        领域类型（Profile / Skill / Project / Post ...）
│       ├─ src/schemas.ts      Zod 校验（入参校验的唯一来源）
│       ├─ src/api.ts          API 路径常量 + 统一响应类型
│       ├─ src/markdown.ts     Markdown 渲染管线（唯一的渲染实现）
│       └─ src/query.ts        查询参数解析（分页、标签筛选）
│
├─ apps/
│   ├─ web/                   公开站点（Astro）
│   │   ├─ astro.config.mjs   output: 'server'、适配器、构建配置
│   │   ├─ src/pages/         路由（对应 PRD 站点地图）
│   │   │   ├─ index.astro
│   │   │   ├─ about.astro
│   │   │   ├─ projects/index.astro
│   │   │   ├─ projects/[slug].astro
│   │   │   ├─ blog/index.astro
│   │   │   ├─ blog/[slug].astro
│   │   │   ├─ tags/[tag].astro
│   │   │   ├─ contact.astro
│   │   │   ├─ rss.xml.ts      RSS 输出端点
│   │   │   └─ sitemap.xml.ts  站点地图输出端点
│   │   ├─ src/layouts/        BaseLayout / ArticleLayout
│   │   ├─ src/components/     Nav / Footer / StarField / ProjectCard / PostItem
│   │   │                      / SkillGroup / Timeline / EmptyState / TagPill
│   │   ├─ src/styles/         tokens.css（设计令牌）/ base.css / components/
│   │   ├─ src/lib/           数据获取封装（调用 shared 类型 + 内部接口）
│   │   ├─ src/middleware.ts  鉴权 + 错误包装 + 缓存头（替代原 functions/_middleware.ts）
│   │   ├─ src/pages/api/     后端接口（Astro endpoint；运行在 Workers 运行时）
│   │   │   ├─ settings.ts、profile.ts、skills.ts、tags.ts、messages.ts
│   │   │   ├─ projects/index.ts、projects/[slug].ts
│   │   │   ├─ posts/index.ts、posts/[slug].ts
│   │   │   └─ admin/         受保护接口
│   │   │       ├─ profile.ts、settings.ts
│   │   │       ├─ skill-groups.ts、skill-groups/[id].ts
│   │   │       ├─ skills.ts、skills/[id].ts、skills/reorder.ts
│   │   │       ├─ projects.ts、projects/[id].ts
│   │   │       ├─ posts.ts、posts/[id].ts、posts/[id]/publish.ts
│   │   │       ├─ media.ts   图片上传
│   │   │       ├─ messages.ts、messages/[id].ts
│   │   │       ├─ export.ts  全量备份导出
│   │   │       └─ _shared.ts 管理端共用工具（下划线前缀 → 不注册路由）
│   │   ├─ src/lib/server/    服务端内部模块
│   │   │   ├─ db.ts          D1 客户端与查询执行
│   │   │   ├─ repositories/  数据访问层（每个实体一个文件）
│   │   │   ├─ auth.ts        Access JWT 校验与会话身份
│   │   │   ├─ cache.ts       边缘缓存读写与版本键
│   │   │   └─ storage.ts     KV 读写与 key 生成
│   │   └─ public/            静态资源（favicon / 默认分享图 / 字体）
│   │
│   └─ admin/                  后台 SPA（React + Vite）
│       ├─ vite.config.ts
│       ├─ index.html
│       └─ src/
│           ├─ main.tsx
│           ├─ App.tsx        路由与布局
│           ├─ pages/         Overview / Profile / Skills / Projects / Posts / Media / Settings
│           ├─ components/    表单控件 / Markdown 编辑器 / 图片上传 / 表格 / 拖拽排序
│           ├─ api/          接口调用封装（统一错误处理）
│           └─ styles/
│
├─ migrations/                D1 迁移（只新增，不修改已应用的文件）
│   ├─ 0001_init.sql
│   └─ 0002_indexes.sql
│
├─ scripts/
│   ├─ seed.ts                写入演示数据（本地开发用）
│   └─ export-backup.ts       本地导出备份
│
└─ tests/
    ├─ unit/                  Vitest：repositories / schemas / markdown / 工具函数
    └─ e2e/                   Playwright：站点浏览、后台发布流程、降级行为
```

> **⚠️ 实现偏离（脚手架落地时确认，已回写）**
>
> 原计划把后端接口放在 `apps/web/functions/`（Pages Functions 目录）、部署到 Cloudflare Pages。
> 实际落地必须改成 `apps/web/src/pages/api/**` + `src/middleware.ts`，并部署到 **Cloudflare Workers**。
> 原因有两层：
>
> 1. 本仓库钉住的 `@astrojs/cloudflare` **v14 已移除 Cloudflare Pages 支持**（官方升级说明原文即 “Removed: Cloudflare Pages support”）。
>    构建产物是 Workers 形态：`apps/web/dist/server/entry.mjs`（Worker 入口）+ `apps/web/dist/client`（静态资源），
>    由 `@cloudflare/vite-plugin` 产出 —— **不再有 `dist/_worker.js`，因此也就不存在 `functions/` 与它共存的落地位置**。
> 2. Cloudflare 官方也建议新项目直接使用 Workers（Pages 已进入「建议迁移」状态）。
>
> 运行时仍然是 Cloudflare Workers，能力与全部约束（SQL 只出现在 repositories、鉴权失败关闭、
> 缓存键带 content_version）均不变，改变的只是**文件位置与部署目标**：
> `functions/_middleware.ts` → `src/middleware.ts`，`functions/api/**` → `src/pages/api/**`，部署目标 Pages → Workers。

### 2.2 目录职责边界（重要）

| 目录 | 允许放什么 | 禁止放什么 |
| --- | --- | --- |
| `packages/shared` | 纯类型、纯校验、纯函数；**不含**任何 IO | 不能 import `apps/*`；不能依赖 Cloudflare 运行时 API |
| `apps/web/src/lib/server` | 服务端逻辑：数据库访问、鉴权、缓存、存储 | 前端组件不得 import 这里 |
| `apps/web/src/pages/api` | 路由声明、入参校验、调用 repositories、返回响应 | 不写业务 SQL（SQL 只出现在 repositories） |
| `apps/web/src/middleware.ts` | `/api/admin` 与 `/admin` 的 Access JWT 校验、安全头、异常包装 | 不写业务逻辑；不重复实现鉴权判断 |
| `apps/web/src/components` | 展示与交互 | 不直接访问数据库；数据由页面通过 props 注入 |
| `apps/admin` | 管理界面与表单 | 不复刻渲染逻辑，复用 `packages/shared` 的校验与类型 |

**单向依赖**：`apps/*` → `packages/shared`。反向依赖一律禁止，否则共享包会被具体应用污染。

### 2.3 一次请求的路径（帮助理解分层）

```
浏览器 GET /blog
  → Cloudflare 边缘（静态资源命中则直接返回）
  → Astro 页面在 Workers 运行时执行
  → src/lib/server/db.ts 读取 D1（命中边缘缓存则跳过）
  → repositories/posts.ts 组装数据（返回 shared 里的类型）
  → 页面渲染成 HTML + 少量岛屿 JS
  → 带 Cache-Control 与版本键返回

后台 PUT /api/admin/profile
  → src/middleware.ts 校验 Cloudflare Access 的 JWT（失败 → 401）
  → Zod 校验入参（失败 → 400 + 字段级错误）
  → repositories/profile.ts 写入 D1 并自增 content_version
  → 返回 { ok: true }
  → 下一次前台读取因版本键变化而自然拿到新内容（无需手动清缓存）
```

---

## 3. 数据模型

### 3.1 设计原则

1. **一切内容皆数据**：连「站点标题」「页脚文案」也入库（`settings`），保证后台可改、改后不改代码。
2. **不建用户表**：身份由 Cloudflare Access 负责，应用内不存储账号密码（降低安全风险）。
3. **标签共用一张表**：文章与项目共用 `tags`，通过各自的连接表关联，便于统一标签页。
4. **所有时间存 UTC**（ISO 8601 字符串），展示层再转本地时区。
5. **Markdown 存原文**：库里存 Markdown 源文，渲染在读取时进行——保证后台能继续编辑，也让渲染管线升级后历史文章一并受益。

### 3.2 实体关系

```
profile (单行)
skill_groups 1───n skills

projects 1───n project_tags n───1 tags
posts    1───n post_tags    n───1 tags

media        （独立，被 profile / projects / posts 以存储 key 引用）
settings     （键值表：站点级配置）
messages     （留言，独立）
content_revisions （快照，按 entity_type + entity_id 关联到上面各实体）
```

**关于图片引用**：`media` 与内容表之间不做外键，而是以**存储 key**（KV key）弱引用（`avatar_key`、`cover_key` 等）。这样做的好处是内容表不被存储层绑死；代价是需要一个「引用扫描」来统计图片被谁使用（在删除图片时提示影响范围，对应 PRD AC5.5）。

### 3.3 表结构（D1 / SQLite）

> 下列为迁移脚本 `0001_init.sql` 的等价说明，实际以 SQL 文件为准。

**profile** — 个人信息（单行，用 `CHECK (id = 1)` 强制唯一）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | 固定为 1 |
| `display_name` | TEXT NOT NULL | 姓名/昵称 |
| `headline` | TEXT | 一句话定位（首页 Hero） |
| `about_md` | TEXT | 长版简介（Markdown，关于页） |
| `avatar_key` | TEXT | KV 头像 key |
| `location` | TEXT | 所在地 |
| `status` | TEXT | 当前状态，如「开放合作」 |
| `email` | TEXT | 联系邮箱 |
| `resume_key` | TEXT | 简历文件 key |
| `social_links` | TEXT | JSON 数组：`[{label, url, icon}]` |
| `hidden_fields` | TEXT | JSON 数组：不公开的字段名（对应 PRD AC1.2） |
| `updated_at` | TEXT | UTC 时间戳 |

**skill_groups / skills**

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `skill_groups` | `id`, `name`, `sort_order`, `created_at`, `updated_at` | 技能分组 |
| `skills` | `id`, `group_id → skill_groups.id`, `name`, `icon`, `level`(1~5，可空), `sort_order`, `visible`(0/1), `created_at`, `updated_at` | 技能项 |

**projects**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `slug` | TEXT UNIQUE | 英文短语，路由与链接用 |
| `title` / `summary` | TEXT | 标题与一句话摘要 |
| `content_md` | TEXT | Markdown 正文 |
| `cover_key` | TEXT | 封面 KV key |
| `repo_url` / `demo_url` | TEXT | 仓库与演示地址 |
| `status` | TEXT | `active` / `completed` / `archived` |
| `featured` | INTEGER | 0/1，首页精选（对应 PRD AC3.1） |
| `sort_order` | INTEGER | 手动排序优先 |
| `started_at` / `ended_at` | TEXT | 起止时间，可空 |
| `created_at` / `updated_at` | TEXT | |

**posts**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `slug` | TEXT UNIQUE | |
| `title` / `summary` | TEXT | |
| `content_md` | TEXT | Markdown 原文 |
| `cover_key` | TEXT | 封面 key |
| `status` | TEXT | `draft` / `published`（对应 AC4.1） |
| `published_at` | TEXT | 首次发布时间，草稿为空 |
| `reading_minutes` | INTEGER | 由正文词数估算后缓存（对应 AC4.3） |
| `view_count` | INTEGER DEFAULT 0 | 可选统计，不使用第三方埋点 |
| `created_at` / `updated_at` | TEXT | |

**tags / post_tags / project_tags**

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `tags` | `id`, `name` UNIQUE, `slug` UNIQUE | 标签同时服务文章与项目 |
| `post_tags` | `post_id → posts.id`, `tag_id → tags.id` | 复合主键 |
| `project_tags` | `project_id → projects.id`, `tag_id → tags.id` | 复合主键 |

**media** — 已上传资源索引（真实文件在 KV）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK | |
| `key` | TEXT UNIQUE | 存储 key（KV key），命名规则见 §4.7 |
| `mime` | TEXT | 由文件头判定，不看扩展名 |
| `size_bytes` | INTEGER | 上传时校验用 |
| `width` / `height` | INTEGER | 可空，用于预留宽高比防布局跳动 |
| `original_name` | TEXT | 原始文件名（仅展示用） |
| `created_at` | TEXT | |

**settings** — 键值配置

| 字段 | 说明 |
| --- | --- |
| `key` PK | 如 `site_title`、`site_subtitle`、`default_share_image`、`accent_color`、`footer_text`、`content_version` |
| `value` TEXT | JSON 编码的值 |
| `updated_at` | |

> `content_version` 是缓存失效的核心机制，见 §4.2。

**messages** — 留言（对应 F6）

| 字段 | 说明 |
| --- | --- |
| `id`, `name`, `email`, `subject`, `body` | 表单内容 |
| `status` | `new` / `handled` / `spam` |
| `ip_hash` | 仅存哈希（不存明文 IP），用于频率限制 |
| `created_at` | |

**content_revisions** — 版本快照（P1，用于回滚）

| 字段 | 说明 |
| --- | --- |
| `id`, `entity_type`(`profile`/`project`/`post`/`settings`), `entity_id` | 定位被改对象 |
| `snapshot` TEXT | 变更前的 JSON 快照 |
| `note` | 变更说明（可选） |
| `created_at` | |

### 3.4 索引策略

| 索引 | 目的 |
| --- | --- |
| `posts(slug)` UNIQUE、`projects(slug)` UNIQUE | 详情页查询与唯一性保证 |
| `posts(status, published_at DESC)` | 列表页「已发布 + 时间倒序」的主查询 |
| `projects(featured, sort_order)` | 首页精选查询 |
| `skills(group_id, sort_order)` | 技能按组排序 |
| `post_tags(tag_id)` / `project_tags(tag_id)` | 标签筛选与标签页聚合（连接表的方向性索引） |
| `media(key)` UNIQUE | 上传去重与引用查找 |

### 3.5 API 契约

**统一响应格式**（所有接口一致，前端只需实现一套错误处理）

```jsonc
// 成功
{ "ok": true, "data": { /* 载荷 */ }, "meta": { "page": 1, "total": 42 } }

// 失败
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "标题不能为空", "fields": { "title": "不能为空" } } }
```

**公开只读接口**（可被 CDN 缓存，无需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/profile` | 个人信息（已应用 `hidden_fields` 过滤） |
| GET | `/api/skills` | 技能分组与技能（过滤 `visible = 0`） |
| GET | `/api/projects?tag=&page=&featured=` | 项目列表，支持标签筛选与精选过滤 |
| GET | `/api/projects/[slug]` | 项目详情 |
| GET | `/api/posts?tag=&page=` | 文章列表（**只返回已发布**） |
| GET | `/api/posts/[slug]` | 文章详情（含渲染后 HTML 与目录） |
| GET | `/api/tags` | 标签及其内容计数 |
| POST | `/api/messages` | 提交留言（含蜜罐与频率限制） |

**受保护接口**（`/api/admin/*`，Access 放行 + 应用内二次校验）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET / PUT | `/api/admin/profile` | 读取/更新个人信息 |
| GET/POST/PATCH/DELETE | `/api/admin/skills`, `/api/admin/skill-groups` | 技能与分组管理 |
| GET/POST/PATCH/DELETE | `/api/admin/projects` | 项目管理 |
| GET/POST/PATCH/DELETE | `/api/admin/posts` | 文章管理 |
| POST | `/api/admin/posts/[id]/publish` | 草稿转已发布、更新发布时间 |
| GET / POST / DELETE | `/api/admin/media` | 图片列表 / 上传 / 删除 |
| GET / PUT | `/api/admin/settings` | 站点设置 |
| GET / PATCH | `/api/admin/messages` | 留言查看与标记 |
| GET | `/api/admin/export` | 全量 JSON 备份（对应 PRD 备份要求） |

> **容器语义**：列表接口一律返回 `data: { items: [] }`，避免「空结果」在客户端被误判为错误。

---

## 4. 关键技术点

以下每一条都是**真正会在实现时踩坑的地方**，按「问题 → 做法」写。

### 4.1 渲染策略：为什么选按需服务端渲染而不是纯静态生成

**问题**：纯静态生成（构建时把内容烤进 HTML）性能最好，但后台改完内容后必须**重新构建部署**才能在线上生效，与 PRD「后台保存后 60s 内生效」冲突；纯客户端渲染（HTML 骨架 + 前端取数）则首屏慢、SEO 差。

**做法**：Astro 用 `output: 'server'`，页面在 Workers 运行时按需渲染，数据来自 D1。这样改内容立即生效，且首屏仍是完整 HTML（SEO 与无 JS 可读性都不受影响）。代价是每次请求都要执行一次渲染——用 §4.2 的边缘缓存把代价压回去。

**注意**：`output: 'server'` 不等于「放弃静态」：`public/` 下的静态资源、以及明确不依赖数据的页面（如关于页的固定部分）仍以静态资源形式直出，由边缘直接返回，不进入渲染。

### 4.2 缓存一致性：60 秒内生效又不打爆数据库

**问题**：既是痛点也是难点。缓存能救性能，但会让「后台改了就生效」失效；如果每次写操作都手动清理 CDN 缓存，逻辑容易在边缘出问题（缓存节点多、清理有延迟）。

**做法**：**版本键缓存**。

1. `settings.content_version` 是一个整数，**任何写操作成功后自增**。
2. 页面渲染出的 HTML（以及公开 API 响应）在写入边缘缓存时，键里带上 `content_version`：`v=42:/posts?page=1`。
3. 版本一变，旧键自然不再被命中，**不需要主动清缓存**；旧数据由 LRU 自然淘汰。
4. 响应头配合 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`：即使版本未变，最多 60 秒也会回源一次，兼顾「即时性」与「命中率」。
5. 缓存读写统一走 `src/lib/server/cache.ts`，禁止各接口自行拼键。

**为什么不用主动 purge**：主动清理依赖平台能力与权限，且在边缘节点数量多时存在传播延迟；版本键是纯应用层逻辑，行为可预测、可本地测试。

### 4.3 星空背景：性能与降级

**问题**：星空是全站辨识度所在，也是最容易拖慢设备的部分——大量 DOM 元素 + CSS 动画会引发重排与合成层爆炸；重型 3D 库（three.js）在手机上代价过高。

**做法**：
1. **单个 `<canvas>` 手写绘制**，不引入任何图形库；固定全屏、`pointer-events: none`、`aria-hidden="true"`、`z-index` 最低。
2. 按 `devicePixelRatio` 设置画布物理像素，但**上限封顶 2**（4K 屏上限制像素量，避免填充率失控）。
3. 星点数据一次生成后复用，每帧只做位置更新与绘制，**不创建/销毁对象**（避免 GC 抖动）。
4. `document.hidden` 时取消 rAF；恢复时**重置时间基准**，防止累积位移导致「星群突然往前跳」。
5. 降级三档：
   - `prefers-reduced-motion: reduce` → **只画一帧静态星空，不起 rAF 循环**（对应 PRD AC7.2）；
   - 屏幕面积超过阈值或 `navigator.hardwareConcurrency <= 4` → 减少星点数、关闭闪烁与流星；
   - `< 480px` → 星点数量按面积等比缩减。
6. 性能护栏：每帧耗时目标 < 2ms（PRD AC7.3）；用 `performance.now()` 在开发环境打点，若连续多帧超预算则自动降档。

**要点**：星空的「随机感」必须来自固定种子的伪随机（同一次会话内稳定），否则每帧重随机会出现闪烁噪点。

### 4.4 深色主题的首屏白闪

**问题**：深色站点最常见的观感事故——HTML 到达后先渲染浏览器默认白底，CSS 到位后才变黑，产生一次刺眼闪白；移动端 Safari 的地址栏颜色也可能不跟随。

**做法**：
1. 在 `<head>` 的**内联样式之前**给 `html` 一个深色背景（内联 `<style>html{background:#0a0b14}</style>`），不依赖外部 CSS 加载。
2. 声明 `<meta name="theme-color" content="#0a0b14">`，并加 `color-scheme: dark` 让原生控件（滚动条、表单）跟随。
3. 关键 CSS（令牌 + 首屏布局）内联进 HTML，非关键样式异步加载。
4. 站点不做亮色主题切换（PRD 锁定深色），因此**不需要**在首屏前读取 localStorage 决定主题——少一个闪烁源。

### 4.5 Markdown 渲染管线与 XSS

**问题**：Markdown 允许内联 HTML，若直接 `innerHTML` 渲染，后台被攻破（或误粘一段脚本）就会变成存储型 XSS，影响所有访客。

**做法**：
1. 唯一渲染实现放在 `packages/shared/src/markdown.ts`：`remark-parse → remark-rehype → rehype-sanitize（白名单）→ rehype-stringify`，高亮在 sanitize **之前**由 Shiki 完成（保证高亮产物不被清洗掉）。
2. **后台预览与线上渲染调用同一函数**——这是「预览与线上一致」（PRD AC5.3）的技术保证，不允许各写一套。
3. 白名单只放必要标签与属性；`<script>`、`on*` 事件属性、`javascript:` 协议、`<iframe>` 一律剔除。
4. 用户输入（留言、标题等）**永不**当作 HTML 渲染，只做文本转义。

**Workers 环境注意**：不能使用依赖真实 DOM 的消毒库（如需要 jsdom 的 DOMPurify）。`rehype-sanitize` 是纯 AST 变换、不碰 DOM，正好适合边缘运行时。

### 4.6 Workers 运行时的限制（最容易踩坑的一条）

| 限制 | 影响 | 应对 |
| --- | --- | --- |
| 无 Node 内置模块（`fs` / `net` / `child_process`） | 依赖不能直接搬 | 依赖须 edge 兼容；遇到 Node-only 包先换实现 |
| 无 DOM | 依赖 DOM 的库不可用 | 用 AST 类库（如 `rehype-sanitize`）替代 |
| 有 CPU 时间上限 | 重计算会被中断 | 限制 Shiki 语言集；不在请求路径做大批量转码 |
| D1 是网络调用 | 有 p99 抖动，单请求内 N+1 查询代价被放大 | repositories 里合并查询、优先一次取回所需数据 |
| 无长驻进程/内存不可靠 | 不能靠进程内缓存 | 缓存放边缘缓存或 KV，不依赖模块级变量 |
| 环境变量在构建期与运行期不同 | 密钥误泄漏到前端 | 前端只用带 `PUBLIC_` 前缀的变量；密钥只在 Functions 里读 |

### 4.7 图片存储与上传

**问题**：图片是最容易让个人站失控的东西——体积膨胀、格式混乱、上传接口被滥用。

**做法**：
1. `key` 命名规则：`{yyyy}/{mm}/{uuid}.{ext}`（如 `2026/10/3f9a...c1.webp`），时间前缀便于按时间清理与排查。
2. **服务端判定 MIME**：读取文件头魔数，不信任扩展名与 `Content-Type`；只接受 jpg/png/webp/gif。
3. 体积上限 5MB（PRD AC5.4），超限返回字段级错误；同时校验宽高并把 `width/height` 落库，供前端预留宽高比、**消除布局跳动**（现状：宽高解析只覆盖 PNG / GIF，JPEG / WebP 返回 `null`，前端按默认宽高比预留，见 §1.5 偏离说明）。
4. 上传落 `media` 表并与 KV 写入保持一致的失败处理：**先写 KV 再写库**，写库失败则删除已上传对象，避免出现「库里没有但占着存储」的孤儿文件。
5. KV 本就不公开（没有公开桶的概念），仍只经受控路由暴露（`apps/web/src/pages/media/[...key].ts`），避免资源被枚举。
6. 展示层用响应式图片（`<picture>` + AVIF/WebP + `srcset`）+ 懒加载（首屏封面除外），并显式给出宽高，避免 CLS。

### 4.8 鉴权与安全（双层防线）

**问题**：后台一旦被匿名访问，攻击者可直接改站点内容；而自建登录系统本身也是常见漏洞来源。

**做法**：
1. **第一层（边缘）**：Cloudflare Access 对 `/admin*` 与 `/api/admin*` 路径做策略保护，未登录直接拦在边缘，请求根本到不了应用。
2. **第二层（应用内）**：`src/middleware.ts` 校验 Access 签发的 JWT——校验签名（JWKS 公钥，带缓存）、`aud`、`iss`、过期时间；任何一项不过返回 401 且**不返回任何数据**（对应 PRD AC5.1）。
3. 写接口全部经过 Zod 校验；不通过返回 400 + 字段级错误（便于后台定位）。
4. 应用内**不存密码、不发会话 cookie**，从根上避开 CSRF 与密码泄漏。
5. 留言接口：蜜罐字段 + 同 IP 频率限制（存 `ip_hash`，不留明文 IP）；被判定为爬虫时对外表现与成功一致（对应 AC6.2）。
6. 密钥（如发信服务）只存在于 Worker 的环境变量 / Secret，**永远不进前端 bundle**；`.dev.vars` 不进仓库。

### 4.9 D1 的迁移与本地开发

**做法**：
1. 迁移文件放 `migrations/`，用 `wrangler d1 migrations` 管理；**已应用的迁移文件不得修改**，一切变更新增文件（这条写进了 AGENTS.md，因为它是最容易被 AI 忽略、又最难回滚的错误）。
2. 本地开发用 `pnpm dev`（`astro dev`；D1 / KV 绑定由 Cloudflare Vite 插件从根 `wrangler.toml` 注入，状态目录固定在根 `.wrangler/state`）。需要更贴近线上运行时，用 `pnpm preview`（`wrangler dev`，跑的是**构建产物**）。迁移与种子走 CLI（`pnpm db:migrate:local` / `pnpm db:seed`），保证「本地能跑通的东西线上也能跑」。
3. `scripts/seed.ts` 提供演示数据，让本地开发不依赖线上库。
4. 备份：`/api/admin/export` 导出全量 JSON；重建路径是「建库 → 迁移 → 导入」，因此不锁定在 D1（对应 PRD 的平台锁定风险应对）。

### 4.10 SEO 与内容分发

**做法**：SSR 输出完整 HTML → `sitemap.xml` 由代码生成（含 `lastmod`，**只含已发布内容**）→ `robots.txt` 明确 `Disallow: /admin` → 首页 `Person`、文章页 `BlogPosting` 的 JSON-LD → RSS 输出由同一份数据生成，避免列表与订阅不一致。**关键点**：草稿必须在**生成层**就被过滤掉，而不是靠前端隐藏——否则草案会被搜索引擎抓到。

### 4.11 性能预算与图片策略

| 项 | 预算 | 手段 |
| --- | --- | --- |
| 首屏 JS | < 80KB gzip | 岛屿按需加载；后台 SPA 独立构建、不进公开站 |
| 首屏 LCP | < 2.0s（移动 4G） | 关键 CSS 内联、封面图显式宽高 + 高优先级预加载 |
| 星空每帧 | < 2ms | 见 §4.3 |
| 图片 | 上传 ≤ 5MB；展示用 AVIF/WebP | 响应式 + 懒加载 |
| 累计布局偏移 | 趋近 0 | 所有图片给出宽高比；字体不用需要下载的字体文件（系统字体栈） |

### 4.12 可观测性与成本

- **日志**：Workers 日志在 Cloudflare 面板查看；接口统一在 `src/middleware.ts` 里输出结构化日志（路径、耗时、状态码、是否命中缓存）。**不记录**访客 IP 明文与邮箱。
- **错误上报**：可选接入边缘友好的错误收集；不上报则至少保证失败有明确响应体，便于排查。
- **统计**：仅使用无 Cookie 的站点分析（符合 PRD 隐私要求）。
- **免费额度边界**（需要心里有数）：Workers 每日请求数、Workers Builds 每月构建次数、Access 免费用户数上限、D1 的每日读写行数、KV 的存储与读写次数。个人站正常使用远低于这些上限，但要避免**把大图转码或批量任务塞进请求路径**，那才是配额与 CPU 时间的真实杀手。

---

## 5. 环境与部署

### 5.1 环境划分

| 环境 | 用途 | 数据 | 访问控制 |
| --- | --- | --- | --- |
| 本地 | 开发与自测 | 本地 D1（wrangler） | 本地中间件可放行（仅开发环境，需显式开关） |
| 预览 | 每次推送自动生成 | 预览用 D1 或共享开发数据 | 与生产同策略，避免预览环境裸奔 |
| 生产 | 线上 | 生产 D1 + KV | Access 严格策略 |

**原则**：预览环境的后台也必须有访问控制。否则「预览链接泄漏 = 后台裸奔」是最容易被忽视的事故。

### 5.2 部署流程

本项目部署到 **Cloudflare Workers**（不是 Pages），采用 **Git 集成自动构建**：仓库连到 Cloudflare 后，
每次向主分支推送都会自动重新构建并部署，无需本地操作。

```
git push（主分支）
  → Workers Builds 拉取仓库
  → 安装依赖（pnpm install）
  → 构建（pnpm build = shared → web → admin，含把后台产物搬进静态资源目录）
  → 产出：apps/web/dist/server/entry.mjs（Worker 入口）+ apps/web/dist/client（静态资源，其中 admin/ 是后台）
  → 部署（npx wrangler deploy --config apps/web/dist/server/wrangler.json）
  → 绑定 D1（DB）与 KV（MEDIA）
```

**控制台关键填写项**（选错会导致构建失败或产物找不到）：

| 项 | 值 |
| --- | --- |
| 框架预设 | **Astro** |
| 构建命令 | `pnpm install && pnpm build` |
| 部署命令 | `npx wrangler deploy --config apps/web/dist/server/wrangler.json` |
| 环境变量 | `NODE_VERSION=20`，并补齐 `SITE_URL` 等（§5.4） |
| 绑定 | D1 变量名 `DB`、KV 变量名 `MEDIA`。**Git 集成部署不会自动读取 `wrangler.toml` 的绑定，必须在控制台手动添加** |

**`main` / `assets` 为什么不写在根 `wrangler.toml`**：这两个字段指向的文件是**构建产物**，
而构建期间 `@cloudflare/vite-plugin` 会先校验配置里的 `main` 是否已存在 —— 写上去会让首次构建
必然失败（先有鸡还是先有蛋）。所以根配置只声明绑定与变量，真正用于部署的是构建生成的
`apps/web/dist/server/wrangler.json`（它自动继承根配置，并补上 `main` / `assets`）。

**为什么迁移不自动化**：迁移是不可逆的破坏性操作，自动化会让「构建触发迁移」这种意外发生。个人项目用一条显式命令换取可控性。

### 5.3 域名与路径

默认会拿到一个 `*.workers.dev` 的访问地址；不想用它，可在控制台为该 Worker 绑定**自定义域名**。

| 路径 | 内容 | 保护 |
| --- | --- | --- |
| `/` | 公开站点 | 无 |
| `/admin*` | 后台 SPA（构建时搬进静态资源目录） | Cloudflare Access |
| `/api/*` | 公开只读接口 | 无（但只读、且过滤草稿） |
| `/api/admin/*` | 管理接口 | Access + 应用内 JWT 校验 |
| `/rss.xml`、`/sitemap.xml` | 订阅与地图 | 无 |

> 静态资源由 Worker 的 `assets` 绑定提供。`_headers` / `_redirects` 在 Workers 上**仍然受支持**，
> 但**只作用于静态资源**；本站是 SSR（`output: 'server'`），页面响应由 Worker 生成，
> 因此**页面与接口的安全响应头必须由 `src/middleware.ts` 下发**，不能指望 `_headers`。

### 5.4 环境变量与密钥

| 名称 | 用途 | 类型 |
| --- | --- | --- |
| `SITE_URL` | RSS / sitemap 的绝对链接前缀 | 明文变量（`wrangler.toml` 的 `[vars]`） |
| `ACCESS_TEAM_DOMAIN` / `ACCESS_JWT_AUD` | 应用内校验 Access JWT | 环境变量（控制台填，不进仓库） |
| `MESSAGE_IP_SALT` | 留言 IP 哈希的盐值 | **Secret**（`wrangler secret put`） |
| `ALLOW_LOCAL_ADMIN` | 本地放行后台 | 仅本地 `.dev.vars`，**生产必须不设置** |

---

## 6. 技术风险与对应

| 风险 | 触发场景 | 对应措施 |
| --- | --- | --- |
| 边缘缓存导致改了不生效 | 站主在后台保存后看不到变化 | 版本键机制（§4.2）+ 后台提供「强制刷新」提示文案 |
| Markdown 渲染差异 | 后台预览与线上不一致 | 共用同一渲染函数（§4.5），并在单元测试里断言一致性 |
| D1 查询变慢 | 文章数量增长、标签连接查询未走索引 | 索引在 `0002_indexes.sql` 一次建齐；查询语句禁止 `SELECT *` |
| Workers 依赖不兼容 | 引入 Node-only 依赖在部署后才报错 | CI 里执行一次「边缘兼容检查」（构建 + 冒烟请求） |
| 星空在低端机掉帧 | 老旧安卓设备 | 三档降级（§4.3），并在真机上验证 |
| 图片失控 | 长期积累大图 | 上传校验 + 定期审查图片库（后台可见总体积） |
| Access 配置被误改 | 后台暴露 | 应用内二次校验（§4.8）+ 上线前用匿名请求做一次验证 |

---

## 7. 与 PRD 的对应关系

| PRD 功能 | 技术实现落点 |
| --- | --- |
| F1 个人信息 | `profile` 表 + `/api/admin/profile` + `hidden_fields` 过滤 |
| F2 技能展示 | `skill_groups` / `skills` + 排序字段 |
| F3 项目展示 | `projects` + `project_tags` + `featured` 标记 |
| F4 博客 | `posts` + `post_tags` + `/api/posts` + `rss.xml.ts` + 生成层过滤草稿 |
| F5 后台管理 | `apps/admin` SPA + `/api/admin/*` + Access 双层鉴权 |
| F6 联系留言 | `messages` 表 + 蜜罐 + `ip_hash` 频率限制 |
| F7 星空与深色主题 | `StarField` 组件 + 设计令牌 + 三档降级（§4.3、§4.4） |
| F8 响应式 | 设计令牌 + `clamp()` + 断点栅格 |
| F9 SEO 与分享 | SSR + sitemap/RSS 端点 + JSON-LD |
| 备份与迁移 | `/api/admin/export` + 标准 SQL 数据模型 |
