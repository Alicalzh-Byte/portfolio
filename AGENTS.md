# AGENTS.md · AI 代理开发规范

本文件是**AI 代理与人类开发者在本项目中的共同工作约定**。开始任何编码任务前必须先读本文件，以及与任务相关的 [PRD.md](./PRD.md) / [TECH_DESIGN.md](./TECH_DESIGN.md)。

> **当前状态**：本仓库处于「文档先行」阶段，代码脚手架尚未落地。下文中的命令（`pnpm dev` 等）是项目的**既定接口**，脚手架建立后必须逐条可用；在它们尚未存在时，不要假装已经执行过。

---

## 1. 项目概述

| 项 | 内容 |
| --- | --- |
| 项目 | 个人展示网站（个人介绍 / 技能 / 项目 / 博客） |
| 视觉定位 | 深色主题 + 星空背景 + 简洁现代 |
| 部署 | Cloudflare Workers（零服务器运维）。**不是 Cloudflare Pages**，原因见 §2 注意事项 5 |
| 前台 | Astro（`output: 'server'`）+ 原生 CSS 设计令牌 + 少量原生 TS 岛屿 |
| 后台 | React 18 + Vite 独立 SPA，挂 `/admin`，由 Cloudflare Access 保护 |
| 后端 | Cloudflare Workers 运行时 + Hono + Zod。**接口以 Astro endpoint 实现**（`src/pages/api/**` + `src/middleware.ts`），原因见 TECH_DESIGN §2.1 的偏离说明 |
| 数据库 | Cloudflare D1（SQLite） |
| 图片存储 | Cloudflare R2 |
| 包管理 | pnpm workspaces（`packages/shared` + `apps/web` + `apps/admin`） |

**最高优先级约束（违反即视为任务失败）**

1. **后端可改内容**：任何「展示在页面上的内容」都必须来自 D1，由后后台可编辑。**不允许把内容硬编码进模板**。
2. **零服务器**：不引入需要常驻进程/容器的方案（不自建 Node 服务、不引入需要数据库连接池长连接的库）。
3. **深色 + 星空**：视觉方向不做「加个亮色主题开关」这类扩展。
4. **多端可用**：任何界面改动必须在 320px 与 1440px 两档下都不破版。

---

## 2. 快速开始（命令接口）

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 本地开发（`astro dev`）。本地 D1 / R2 / 环境变量绑定由 Cloudflare Vite 插件从仓库根 `wrangler.toml` 注入，因此**改绑定要改根配置**，不是改 `apps/web` 下的文件 |
| `pnpm preview` | `wrangler dev`：以**构建产物**在真实 Workers 运行时（workerd）里预览，最贴近线上。**需先 `pnpm build`** |
| `pnpm build` | 构建 shared → web → admin，最后把后台 SPA 产物搬进 Worker 的静态资源目录（`scripts/copy-admin.ts`），使 `/admin` 在线上可用 |
| `pnpm lint` | ESLint 检查 |
| `pnpm typecheck` | `tsc --noEmit`（全部包） |
| `pnpm test` | Vitest 单元测试 |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm test:e2e` | Playwright 端到端测试 |
| `pnpm format` | Prettier 格式化 |
| `pnpm db:migrate:local` | 应用 D1 迁移到本地实例 |
| `pnpm db:seed` | 写入演示数据（**幂等**，可重复执行；加 `-- --remote` 写线上） |
| `pnpm db:migrate:remote` | 应用到线上（**人工显式执行**，见 §7） |

**环境注意事项（脚手架落地时实测得出，踩过就别再踩）**

1. **TypeScript 钉在 6.x**：`typescript-eslint@8` 对 `typescript >= 7` 会直接抛错拒绝加载，升到 7 会让 `pnpm lint` 整体不可用。
2. **本地 D1 状态目录固定在仓库根 `.wrangler/state`**：CLI（`pnpm db:*`）与 dev（`astro dev`）必须共用同一份库，否则会出现「表已建好但 dev 里查不到」的假象。`astro.config.mjs` 里用 `persistState` 显式指回根目录。
3. **预览/构建产物与源码的绑定来自同一个 `wrangler.toml`**，不要另建第二份配置。
4. **改了依赖（安装/升级包）后必须重启 dev**：Vite 的 SSR 预打包缓存会失效，旧进程会持续报模块找不到；必要时删掉 `apps/web/node_modules/.vite` 再启动。
5. **部署目标是 Cloudflare Workers，不是 Pages**：`@astrojs/cloudflare` v14 已移除 Pages 支持，产物是 Workers 形态（`apps/web/dist/server/entry.mjs` + `apps/web/dist/client`）。所以**不要**写 `pages_build_output_dir`，也**不要**用 `wrangler pages dev/deploy` 那一套。
6. **根 `wrangler.toml` 不写 `main` / `assets`**：构建期间 `@cloudflare/vite-plugin` 会先校验配置里的 `main` 指向的文件已存在，而那个文件恰恰是本次构建才生成的 —— 写上去会让**首次构建必定失败**（实测报 `main field ... doesn't point to an existing file`）。真正用于部署的是构建产物里的 `apps/web/dist/server/wrangler.json`（自动继承根配置的绑定与变量），部署命令：`npx wrangler deploy --config apps/web/dist/server/wrangler.json`。

**提交前必须全部通过**：`pnpm lint && pnpm typecheck && pnpm test`。这三条任一失败，不得声称任务完成。

---

## 3. 目录地图与职责边界

```
packages/shared    纯类型 / Zod 校验 / 纯函数（Markdown 渲染）。不含 IO。
apps/web           公开站点（Astro 页面 + src/pages/api 接口 + src/middleware.ts + lib/server 服务端逻辑）
apps/admin         后台 SPA
migrations/        D1 迁移 SQL
scripts/           开发脚本（seed、备份导出）
tests/             unit（Vitest）+ e2e（Playwright）
```

**依赖方向是单向的：`apps/*` → `packages/shared`。**

| 规则 | 说明 |
| --- | --- |
| `packages/shared` 不得 import `apps/*` | 共享包被具体应用污染后，后台与前台会各自漂移 |
| `packages/shared` 不得依赖 Workers/Cloudflare 运行时 API | 它必须能在浏览器、Workers、测试环境三处运行 |
| 前端组件不得 import `apps/web/src/lib/server/*` | 避免服务端代码（含密钥读取）被打进前端 bundle |
| **SQL 只允许出现在 `lib/server/repositories/`** | 接口层与页面层不得直接写 SQL |
| 前端不得直接 fetch D1/R2 | 一律走 `/api/*` |

**放置决策速查**

| 我要写的东西 | 放哪 |
| --- | --- |
| 一个新的数据类型与校验规则 | `packages/shared/src/{types,schemas}.ts` |
| 一段两个端点都要用的纯逻辑 | `packages/shared/src/` |
| 一次数据库查询 | `apps/web/src/lib/server/repositories/<entity>.ts` |
| 一个新接口路由 | `apps/web/functions/**` |
| 一个展示组件 | `apps/web/src/components/` |
| 一个后台表单 | `apps/admin/src/pages/` 或 `components/` |

---

## 4. 开发规范

### 4.1 数据与接口

- **接口形状统一**：成功 `{ ok: true, data, meta? }`；失败 `{ ok: false, error: { code, message, fields? } }`。不得自创另一种形状。
- **容器语义**：列表接口返回 `data: { items: [] }`，空结果也是成功，不得返回 `null`。
- **入参一律 Zod 校验**：校验失败返回 400 且带上字段级错误，方便后台定位到具体输入框。
- **新增字段的四步**（缺一步即为未完成）：
  1. `migrations/` 新增迁移文件（含 `ALTER TABLE` 或建表）；
  2. `packages/shared/src/types.ts` 加类型；
  3. `packages/shared/src/schemas.ts` 加校验；
  4. 后台表单加输入项 + 前台展示（若需要）。
- **禁止 `SELECT *`**：显式列出字段，避免新增字段时无意改变接口形状与载荷体积。
- **日期时间**：一律存 UTC ISO 8601 字符串，展示层再转本地时区。不在数据库里存本地时间。

### 4.2 后端（Pages Functions）

- 路由文件只做三件事：**校验入参 → 调用 repository → 组装响应**。业务逻辑不写在路由里。
- 所有 `/api/admin/*` 必须同时满足：经过 Access（边缘）+ 应用内 JWT 校验（`_middleware.ts`）。**不得**因为「Access 已经挡住了」就跳过应用内校验。
- 缓存读写统一走 `lib/server/cache.ts`，键必须包含 `content_version`。**禁止**自行拼接缓存键。
- 密钥只能从 Workers 环境变量读取，**永远不写进任何返回体或前端可读的配置**。
- 新增依赖前先确认它能在 Workers 运行时运行（无 Node 内置模块依赖、无 DOM 依赖）。**不确定就不要引**。

### 4.3 数据写入与一致性

- **任何内容写操作成功后必须自增 `settings.content_version`**，否则前台会长时间看到旧内容。
- 图片上传的顺序固定：**先写 R2，再写 `media` 表**；写库失败要回滚已上传对象，避免孤儿文件。
- 删除操作要能回答「影响面」：删除图片前扫描引用并在接口响应里给出 `usage` 信息。
- 破坏性操作（删文章、删项目、删图片）在后台必须二次确认，并由服务端记录 `content_revisions` 快照（P1 落地前至少保留一份可恢复备份）。

### 4.4 内容渲染与安全

- Markdown **只有一份实现**：`packages/shared/src/markdown.ts`。前台渲染与后台预览必须调用同一函数，不得各写一套。
- 渲染顺序固定：`remark-parse → remark-rehype → Shiki 高亮 → rehype-sanitize → rehype-stringify`。**sanitize 必须在最后**（在高亮之后），否则高亮产物会被清洗掉。
- **禁止** `innerHTML` 直接插入用户输入（留言、标题、标签等）；这类内容一律文本转义。
- 白名单之外一律剔除：`<script>`、`on*` 事件属性、`javascript:` 协议、`<iframe>`、`<style>`。
- **草稿必须在生成层过滤**：公开接口、列表页、RSS、sitemap 都不得包含 `status='draft'` 的内容。不允许「前端隐藏」这种伪过滤。

### 4.5 前端（前台）

- **默认零 JS**：能静态渲染的就不加交互；新增岛屿必须能说明「为什么不用 CSS 解决」。首页 JS 预算 < 80KB gzip。
- **图片必须显式给出宽高**（或宽高比），杜绝布局跳动；首屏封面除外，其余懒加载。
- **不做亮色主题**，不做主题切换开关；深色是产品设定。
- 样式全部走设计令牌（`src/styles/tokens.css` 中的 CSS 变量）。**禁止魔法数字**：颜色、间距、圆角、时长都必须引用变量。
- 新增视觉元素前先查 PRD §5 是否已有规范（色彩、排版、组件、动效）；没有规范就**先补文档再加代码**。

### 4.6 星空组件（特殊约束，改它前请先读 TECH_DESIGN §4.3）

- 只用**一个 `<canvas>`** 手写绘制。**禁止**引入 three.js / p5.js / 任何图形或动画库。
- **禁止**用大量 DOM 元素 + CSS 动画模拟星空（会造成重排与合成层压力）。
- 必须保留三档降级：`prefers-reduced-motion` → 静态单帧（**不得启动 rAF 循环**）；低端设备 → 减少星点、关闭流星；窄屏 → 按面积缩减。
- 必须在 `document.hidden` 时暂停，恢复时**重置时间基准**（否则会出现位移跳变）。
- 星点随机必须来自**固定种子**，不得每帧重新随机（会出现噪点闪烁）。
- 画布物理像素 `devicePixelRatio` 封顶 2。

### 4.7 后台（Admin）

- 表单必须处理三态：保存中（禁用 + 反馈）、成功（明确提示）、失败（**保留用户输入** + 字段级错误）。
- 编辑器必须实时预览，且预览调用与线上同一渲染函数。
- 未保存内容时离开页面要提示，避免误丢草稿。
- 后台代码**不得**被打进公开站 bundle（独立构建产物）。

### 4.8 可访问性（每个界面改动的必做项）

- 语义标签（`header / nav / main / section / footer`），标题层级不跳级。
- 所有可交互元素键盘可达，`:focus-visible` 在深色下有可见光环。
- 表单控件必须有 `<label>`，错误信息通过 `aria-describedby` 关联。
- 纯装饰元素（星空等）标记 `aria-hidden="true"`。
- 正文对比度 ≥ 4.5:1；`--text-muted` 不得用于正文段落。
- 触控目标 ≥ 44×44px。
- `prefers-reduced-motion` 下所有进入动画直接呈现终态，**不得停留在透明态**（这是最常见的「关了动效就白屏」事故）。

---

## 5. 代码风格

### 5.1 TypeScript

- `strict: true`，**禁止 `any`**；确实未知用 `unknown` + 收窄。
- **禁止 `@ts-ignore` / `@ts-expect-error` 掩盖类型问题**。要抑制必须写明原因并优先修根因。
- 导出类型优先用 `type`，避免无意义的 `interface` 堆叠；公共 API 必须显式标注返回类型。
- 模块用 ESM（`import` / `export`），不使用 `require`。

### 5.2 命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 变量/函数 | camelCase，动词开头表达意图 | `getPublishedPosts`、`bumpContentVersion` |
| 类型/组件 | PascalCase | `Project`、`StarField`、`PostEditor` |
| 常量 | UPPER_SNAKE | `MAX_UPLOAD_BYTES` |
| 文件（组件） | PascalCase `.astro` / `.tsx` | `ProjectCard.astro` |
| 文件（模块） | kebab-case | `post-tags.ts` |
| 数据库表/字段 | snake_case | `skill_groups`、`published_at` |
| API 路径 | kebab-case，资源用复数 | `/api/admin/skill-groups` |

**命名要能自解释**：`data`、`info`、`item`、`handle`、`temp` 这类名字必须带上前缀说明是什么的数据（如 `postItems`、`projectEditForm`）。

### 5.3 注释

- **只解释「为什么」，不复述「是什么」**。`// 自增版本号，让边缘缓存的旧键失效` 是好注释；`// 自增 version` 是噪音。
- 复杂正则、位运算、平台兼容分支、非直觉的性能取舍，必须有注释。
- 公开函数在 `packages/shared` 中需有简短 JSDoc（说明参数约束与边界行为）。
- 不留 `TODO` 式的空承诺：要么留可执行的说明（含原因与后续动作），要么开 Issue 并写明编号。

### 5.4 CSS

- 全部使用设计令牌；新增令牌要加进 `tokens.css` 并同步 PRD §5 的表格。
- 选择器扁平（避免三层以上嵌套）；组件样式就近存放。
- 移动优先：默认写移动端样式，再用 `min-width` 断点增强。
- 不使用 `!important`（除非对抗第三方样式，且必须写注释说明原因）。
- 过渡/动画时长引用令牌，不写死的毫秒数。

### 5.5 提交信息

采用 `类型: 说明` 前缀，说明用中文、动宾结构、聚焦「做了什么」：

| 类型 | 用途 |
| --- | --- |
| `add:` | 新增功能或文件 |
| `update:` | 修改已有功能 |
| `fix:` | 修复缺陷 |
| `refactor:` | 重构（行为不变） |
| `docs:` | 文档变更 |
| `test:` | 测试相关 |
| `chore:` | 构建/依赖/配置 |

示例：`add: 项目详情页与标签筛选`、`fix: 星空在标签页切换后位移跳变`。

---

## 6. 测试要求

### 6.1 分层与必测内容

| 层 | 工具 | 必须覆盖 |
| --- | --- | --- |
| 单元 | Vitest | `repositories` 的查询与写入逻辑、`schemas` 校验边界、`markdown` 渲染（含 XSS 用例）、缓存键生成、阅读时长估算 |
| 契约 | Vitest | 公开接口**不得**返回草稿内容；后台接口未鉴权一律 401；响应形状符合 §4.1 |
| 端到端 | Playwright | 站点浏览（首页/列表/详情/标签）、后台完整发布流程、降级行为 |
| 人工 | — | 真机（手机）浏览、星空帧率、对比度与键盘遍历 |

### 6.2 必测清单（这些是回归高发区，改动相关模块时必须补测）

1. **XSS**：Markdown 中写入 `<script>`、`<img onerror>`、`javascript:` 链接 → 输出必须被清除。
2. **预览一致性**：同一段 Markdown，后台预览与线上渲染结果**逐字符相同**。
3. **草稿隔离**：草稿在列表 / 详情 / RSS / sitemap / 搜索中均不可见。
4. **缓存失效**：写操作后 `content_version` 自增；带旧版本键的缓存不再被命中。
5. **鉴权**：模拟匿名请求访问 `/api/admin/*` 与 `/admin` → 401 或跳转，且响应体**不含任何数据**。
6. **上传校验**：伪造扩展名（如把脚本改名为 `.png`）必须被文件头检测拒绝；超限文件被拒。
7. **星空降级**：`prefers-reduced-motion` 下不产生持续动画；`document.hidden` 后无 rAF 活动。
8. **响应式**：320 / 375 / 768 / 1024 / 1440 / 1920 六档无横向滚动。
9. **无障碍**：键盘可完成「浏览列表 → 进入详情 → 提交留言」；焦点可见；表单错误被读出。
10. **空状态**：无项目 / 无文章 / 无留言时各页面有空状态，不出现空白与报错。

### 6.3 完成定义（DoD）

一个任务只有在下列全部成立时才可称为「完成」：

- [ ] 功能按 PRD 的验收标准逐条自检通过
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 全部通过
- [ ] 涉及界面的改动：新增/更新了对应的 e2e 用例，并在 320px 与 1440px 下验过
- [ ] 涉及数据模型的改动：迁移文件已新增（未修改历史迁移），并同步了 `TECH_DESIGN.md` §3
- [ ] 涉及行为变化的改动：同步了 `PRD.md` 对应条目与验收标准
- [ ] 报告结果时**如实说明未验证的部分**（例如「未在真机验证星空帧率」），不得用「应该没问题」代替验证

---

## 7. 注意事项与红线

### 7.1 绝对禁止（违反会造成不可逆影响）

1. **不得修改已应用的迁移文件**（`migrations/` 中已存在的那几个）。任何结构变更都要**新增**文件。这是本项目最难回滚的错误。
2. **不得提交密钥**：`.dev.vars`、含 token 的配置文件、真实邮箱与 IP 一律不进仓库。仓库只保留 `.dev.vars.example`。
3. **不得在前端读取密钥或直接访问数据库/存储**。
4. **不得为了绕过问题而降低安全等级**：不改 Access 策略、不把 `/api/admin/*` 挪到公开路径、不为「本地方便」而在代码里留后门（如 `if (isDev) return true` 混入生产）。
5. **不得擅自扩大范围**：不新增框架/UI 组件库/图形库，不重构无关代码，不「顺手」改设计风格。需要新依赖时先说明用途与替代方案，等确认。
6. **不得伪造验证结果**：没执行过的命令不写「已通过」，没看的文件不写「已确认」。工具报错就如实报告错误原文。
7. **不得在公开出口泄漏草稿**。

### 7.2 需要先问再动手的情况

- 要新增一个第三方依赖（尤其含运行时成本或涉及数据外发的）
- 要改动数据模型的既有字段类型或语义（影响迁移与历史数据）
- 要改视觉规范（色彩、星空规范、动效时长）而 PRD 中没有对应条目
- 要改动部署方式、域名、访问控制策略
- 需求本身有歧义或与 PRD 冲突时

### 7.3 环境与部署注意

- **迁移不自动化**：`pnpm db:migrate:remote` 由人工显式执行，不写进构建流程。构建期间禁止触发数据库变更。
- **预览环境的后台同样受保护**：不要把预览链接当成内部环境而放松访问控制。
- **上线前必做**：用匿名请求验证 `/admin` 与 `/api/admin/*` 被拒绝（这是唯一能证明后台没有裸奔的手段）。
- 本地开发放行逻辑必须由**显式环境变量**控制，且默认关闭。

### 7.4 性能注意

- 不在请求路径上做重计算（大图转码、批量渲染），Workers 有 CPU 时间上限。
- 不依赖模块级变量做缓存（运行时实例不可靠），缓存一律走边缘缓存层。
- 新增岛屿前先算一笔账：它为首页 JS 预算增加多少 KB。

---

## 8. 常见任务操作手册

### 8.1 加一个前台展示字段（例：给项目加「团队成员」）

1. `migrations/` 新增 `00xx_add_project_members.sql`
2. `packages/shared/src/types.ts` 加字段；`schemas.ts` 加校验
3. `lib/server/repositories/projects.ts` 在**显式字段列表**中加上它（禁止 `SELECT *`）
4. `functions/admin/projects.ts` 确认写入路径包含该字段
5. `apps/admin` 项目表单加输入项
6. `apps/web` 详情页加展示（遵守令牌与无障碍要求）
7. 补单元测试（校验边界）与 e2e（后台能改、前台能变）
8. 同步 `TECH_DESIGN.md` §3.3 表格

### 8.2 加一个接口

1. `packages/shared/src/api.ts` 加路径常量；`schemas.ts` 加出入参校验
2. 在 `apps/web/functions` 对应目录建路由文件（三件事：校验 → repository → 响应）
3. 逻辑写进 `lib/server/repositories/`；需要缓存则走 `cache.ts` 并带版本键
4. 若属管理接口：确认走 `_middleware.ts` 的鉴权分支
5. 补契约测试（形状 + 鉴权 + 草稿过滤）
6. 同步 `TECH_DESIGN.md` §3.5

### 8.3 加一个页面

1. 先确认它在 PRD §3.1 站点地图中（不在就先补 PRD）
2. `apps/web/src/pages/` 建文件，套用现有 `layouts`
3. 数据通过页面层调用接口获取（SSR），前端不得直连数据库
4. SEO 要素齐全（title/description/canonical/OG）
5. 空状态、加载失败兜底、320px 与 1440px 双档自检
6. 补 e2e 冒烟用例

---

## 9. 交付前自查清单

- [ ] 改动范围只覆盖任务要求，未顺手改无关代码或风格
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 通过（贴出真实输出）
- [ ] 涉及界面的：320px / 1440px 两档验过；键盘可操作；深色下对比度合格
- [ ] 涉及 `prefers-reduced-motion` 的：降级路径验过，且内容不会停留在不可见状态
- [ ] 涉及数据：迁移是**新增**文件；`content_version` 已自增；草稿未泄漏
- [ ] 涉及管理接口：匿名访问被拒
- [ ] 涉及星空：未引入图形库；三档降级仍在；`document.hidden` 暂停仍生效
- [ ] 文档已同步（PRD 验收标准 / TECH_DESIGN 数据模型与接口 / 本文件的红线若有变化）
- [ ] 报告中**如实说明未验证项**与已知限制
