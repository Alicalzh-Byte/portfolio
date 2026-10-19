/**
 * 演示数据种子脚本 —— `pnpm db:seed`
 *
 * 设计要点：
 *   1. **幂等**：先清空内容表再写入，重复执行结果一致，不会累积重复行。
 *   2. **不依赖仓库层**：直接产出 SQL 交给 wrangler 执行。原因见下。
 *   3. **写入前先自增 content_version**：内容变了版本号必须跟着变，否则边缘缓存会继续命中旧键。
 *
 * 为什么不在脚本里 import 仓库层去写库：仓库层依赖 workerd 的虚拟模块 `cloudflare:workers`
 * 拿 D1 绑定，在纯 Node 进程里不可用。种子脚本运行在 Node 侧，只能走 wrangler CLI 通道。
 *
 * 用法：
 *   pnpm db:seed                # 写入本地 D1（.wrangler/state）
 *   pnpm db:seed -- --remote    # 写入线上（需先在 wrangler.toml 填好真实 database_id）
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { estimateReadingMinutes } from '@portfolio/shared/markdown';
import { toSlug } from '@portfolio/shared/query';

const DATABASE_NAME = 'portfolio-db';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sqlPath = path.join(projectRoot, '.wrangler', 'seed.sql');

const remote = process.argv.includes('--remote');

/** 把值转成 SQL 字面量：字符串单引号包裹并把内部单引号翻倍，null 原样输出。 */
function lit(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * JSON 字段统一序列化后再进库（库内约定：JSON 编码的字符串）。
 *
 * 返回值带 `SQL:` 前缀，用来告诉 insert() 「这已经是现成的 SQL 字面量，别再包一层引号」——
 * 否则字符串会被字面量化两次，读回来变成 `'"陈知远 · 个人网站"'` 这种带引号的脏值。
 */
function json(value: unknown): string {
  return `SQL:${lit(JSON.stringify(value))}`;
}

/** 行值拼成一条 INSERT；列名与值顺序由调用方保证一致。 */
function insert(table: string, columns: string[], rows: (string | number | null)[][]): string {
  const body = rows
    .map((row) => `  (${row.map((cell) => (typeof cell === 'string' && cell.startsWith('SQL:')) ? cell.slice(4) : lit(cell)).join(', ')})`)
    .join(',\n');
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${body};`;
}

/**
 * 代码围栏单独抽成常量：若直接写在模板字符串里会与 JS 的模板语法冲突。
 * 这里用普通字符串拼接，避免转义噪音。
 */
const FENCE = '```';

// ---------------------------------------------------------------------------
// 演示内容
// ---------------------------------------------------------------------------

const aboutMd = [
  '我是一名偏工程实现的全栈开发者，日常在 **TypeScript** 生态里做事：前端把交互和性能打磨好，后端把数据模型和边界条件理清楚。',
  '',
  '## 我关注什么',
  '',
  '- 首屏性能：把「看起来快」变成「测出来快」，Core Web Vitals 有具体数字支撑',
  '- 数据一致性：写操作与缓存失效必须原子，宁可多一次回源也不要读到旧数据',
  '- 可维护性：约束写进规范和测试，而不是靠记忆和口头约定',
  '',
  '## 技术取向',
  '',
  '偏好**少依赖、少抽象**的方案：能用一个 `<canvas>` 手写完成的星空，就不引入整套图形库；',
  '能用一套函数覆盖的业务逻辑，就不拆成五层架构。',
  '',
  '## 联系',
  '',
  '欢迎通过[留言页](/contact)或邮件交流，我通常会在两个工作日内回复。',
].join('\n');

// 故意放入一段会被消毒掉的原始 HTML，用来验证 Markdown 管线的 XSS 防护确实生效：
// 渲染结果里它必须显示为「转义后的纯文本」，而不是真的执行。
const xssProbeMd = [
  '## 背景',
  '',
  '这篇文章同时充当 Markdown 渲染管线的样例：标题、列表、代码块、链接，以及一段**应当被消毒**的原始 HTML。',
  '',
  '下面这两行是刻意插入的攻击探针，如果渲染后变成了可点击的脚本，说明消毒环节失效：',
  '',
  '<script>alert("xss")</script>',
  '<img src=x onerror="alert(1)">',
  '',
  '## 做法',
  '',
  '渲染顺序固定为 `remark-parse → remark-rehype → Shiki → rehype-sanitize → rehype-stringify`，',
  '消毒**放在最后一步**：只有这样，前面各插件产出的节点才全部经过白名单过滤。',
  '',
  FENCE + 'ts',
  'export function sanitize(input: string): string {',
  '  // 白名单之外的一律丢弃，而不是替换成空字符串后仍保留标签结构',
  '  return schema(input);',
  '}',
  FENCE,
  '',
  '## 结论',
  '',
  '1. 消毒必须是最后一道工序',
  '2. 白名单要显式列出允许的标签与属性，默认拒绝',
  '3. 只放开必要的属性（例如 Shiki 产出的 `style` 也要限定为颜色值）',
].join('\n');

const draftMd = '## 草稿\n\n这篇是草稿，任何前台入口（列表 / 详情 / RSS / sitemap / 标签页）都不应出现它。';

const types = ['TypeScript', 'Astro', 'Cloudflare', 'React', '性能优化'];
// slug 规则必须与 tags.ts 的 ensureTagIds 保持一致：toSlug 只保留 ASCII，
// 中文标签名会得到空串，此时退回「原名小写」——否则标签页链接会变成 /tags/（空的）。
const tagRows = types.map((name, index) =>
  [index + 1, name, toSlug(name) || name.trim().toLowerCase()] as (string | number)[],
);

type SkillGroup = { name: string; skills: { name: string; level: number | null }[] };

const skillGroups: SkillGroup[] = [
  {
    name: '前端',
    skills: [
      { name: 'TypeScript', level: 5 },
      { name: 'Astro', level: 4 },
      { name: 'React', level: 4 },
      { name: 'CSS 与设计令牌体系', level: 4 },
    ],
  },
  {
    name: '服务端与基础设施',
    skills: [
      { name: 'Node.js', level: 4 },
      { name: 'Cloudflare Workers / Pages', level: 4 },
      { name: 'SQLite / D1 数据建模', level: 3 },
      { name: '边缘缓存策略', level: 3 },
    ],
  },
  {
    name: '工具与协作',
    skills: [
      { name: 'Vitest / Playwright', level: 3 },
      { name: 'pnpm workspaces 单仓管理', level: 3 },
    ],
  },
];

type ProjectSeed = {
  slug: string;
  title: string;
  summary: string;
  contentMd: string;
  status: 'active' | 'completed' | 'archived';
  featured: boolean;
  tagIds: number[];
};

const projects: ProjectSeed[] = [
  {
    slug: 'starfield-canvas',
    title: '手写 Canvas 星空背景',
    summary: '零依赖的星空动画：单画布、固定随机种子、三档性能降级。',
    contentMd: [
      '## 目标',
      '',
      '在**不引入任何图形库**的前提下，做出稳定 60fps 的星空背景，并且能在低端机上自动降档。',
      '',
      '## 关键取舍',
      '',
      '- 只用一个 `<canvas>`，而不是「多层 DOM + CSS 动画」：节点数量可控，重绘成本可预测',
      '- 随机数来自**固定种子**：同一台设备每次刷新星点的位置不会乱跳',
      '- `devicePixelRatio` 封顶 2：高分屏上翻倍绘制会直接吃掉一半帧预算',
      '',
      '## 降级策略',
      '',
      '1. `prefers-reduced-motion` 只绘制一帧、不启动 rAF',
      '2. 低端机减少星点数量并关闭流星',
      '3. 窄屏按可视面积折算星点密度',
    ].join('\n'),
    status: 'active',
    featured: true,
    tagIds: [1, 2, 5],
  },
  {
    slug: 'edge-cache-versioning',
    title: '带版本号的边缘缓存方案',
    summary: '内容写操作与缓存键版本号在同一事务内推进，彻底摆脱主动 purge。',
    contentMd: [
      '## 问题',
      '',
      '内容更新后，边缘节点上仍是旧页面。常见做法是「写完主动 purge」，但它有两个硬伤：',
      '',
      '1. purge 是**异步且可能失败**的，失败后没有补偿路径',
      '2. 需要维护一份「哪些 URL 受影响」的映射，边界一多就漏',
      '',
      '## 方案',
      '',
      '把缓存键里带上 `settings.content_version`。任何内容写操作成功后自增版本号，',
      '新请求自然落到新键上，旧键在 TTL 到期后自行淘汰 —— **不需要主动清理任何东西**。',
      '',
      FENCE + 'ts',
      "cacheKey = `v1/${namespace}?v=${contentVersion}`",
      FENCE,
      '',
      '## 收益',
      '',
      '| 维度 | 主动 purge | 版本号键 |',
      '| --- | --- | --- |',
      '| 正确性 | 依赖 purge 成功 | 由键决定，天然正确 |',
      '| 实现复杂度 | 需要维护 URL 映射 | 无额外映射 |',
    ].join('\n'),
    status: 'active',
    featured: true,
    tagIds: [2, 3, 5],
  },
  {
    slug: 'single-source-markdown',
    title: '唯一实现原则：一套 Markdown 管线',
    summary: '后台预览与线上渲染共用同一个函数，避免预览与成品不一致。',
    contentMd: [
      '## 动机',
      '',
      '只要存在两套渲染实现，预览和线上迟早会分叉，而这类分叉往往在上线后才被发现。',
      '',
      '## 做法',
      '',
      '把管线收敛到 `packages/shared/src/markdown.ts`，后台预览和前台详情页都调用它。',
      '渲染步骤的顺序是契约的一部分，不是实现细节。',
    ].join('\n'),
    status: 'completed',
    featured: true,
    tagIds: [1, 2],
  },
  {
    slug: 'draft-filtering-at-source',
    title: '草稿在数据层过滤',
    summary: '草稿过滤写在查询条件里，覆盖列表、详情、标签页、RSS 与 sitemap 五处出口。',
    contentMd: [
      '## 为什么不在模板里过滤',
      '',
      '模板里过滤只能保住「看得见的页面」，RSS 与 sitemap 会安静地把草稿泄露出去。',
      '过滤条件必须写进查询层，并且五处出口全部走同一批查询函数。',
    ].join('\n'),
    status: 'active',
    featured: false,
    tagIds: [2, 4],
  },
];

type PostSeed = {
  slug: string;
  title: string;
  summary: string;
  contentMd: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  tagIds: number[];
};

const posts: PostSeed[] = [
  {
    slug: 'markdown-pipeline-and-xss',
    title: '把 XSS 防在最后一步：Markdown 管线的消毒顺序',
    summary: '消毒放错位置，等于给所有上游插件开了后门。',
    contentMd: xssProbeMd,
    status: 'published',
    publishedAt: '2026-09-18T09:00:00Z',
    tagIds: [1, 2, 5],
  },
  {
    slug: 'why-content-version-beats-purge',
    title: '为什么我用「内容版本号」替代主动缓存清理',
    summary: '让缓存正确性由键决定，而不是由一次可能失败的异步调用决定。',
    contentMd: [
      '## 起因',
      '',
      '改完一篇文章，刷新页面还是旧的。第一反应是「加个 purge 就好了」，但真正棘手的是失败路径。',
      '',
      '## 换个思路',
      '',
      '与其在**写完之后**去清理，不如让**读的时候**自然读到新数据。缓存键带上版本号就能做到这一点。',
      '',
      '## 落地时容易踩的坑',
      '',
      '- `caches.default` 要求键是**完全限定的合法 URL**，裸字符串会直接抛错',
      '- 缓存层异常必须被兜住：缓存是性能优化，不该让请求失败',
    ].join('\n'),
    status: 'published',
    publishedAt: '2026-09-27T02:30:00Z',
    tagIds: [3, 5],
  },
  {
    slug: 'canvas-starfield-without-libs',
    title: '不引依赖做星空：单画布、固定种子与三档降级',
    summary: '把帧预算当成约束来设计，而不是等卡顿了再优化。',
    contentMd: [
      '## 先定预算',
      '',
      '目标是每帧绘制耗时留有余量。有了预算，星点数量、DPR 上限、流星数量才有依据。',
      '',
      '## 三档降级',
      '',
      '1. 尊重 `prefers-reduced-motion`：只画一帧，不启动动画循环',
      '2. 连续多帧超预算 → 自动降一档',
      '3. 窄屏按面积折算密度',
      '',
      '## 一个容易忽略的点',
      '',
      '页面切到后台时应暂停绘制；恢复到前台要**重置时间基准**，否则一帧的 `delta` 巨大，',
      '星星会瞬间跳出一大段位移。',
    ].join('\n'),
    status: 'published',
    publishedAt: '2026-10-06T13:15:00Z',
    tagIds: [1, 5],
  },
  {
    slug: 'draft-filter-everywhere',
    title: '草稿泄露：被忽略的往往是 RSS 和 sitemap',
    summary: '页面漏了看得见，订阅源漏了没人会告诉你。',
    contentMd: [
      '## 问题的形状',
      '',
      '大多数「草稿泄露」不是发生在页面上，而是发生在**没人会打开看的那几个出口**。',
      '页面漏了，你刷新一下就能发现；RSS 和 sitemap 漏了，搜索引擎会先发现。',
      '',
      '## 一共有几个出口',
      '',
      '1. 文章列表页',
      '2. 文章详情页（直接猜 slug 访问）',
      '3. 标签聚合页',
      '4. `/rss.xml`',
      '5. `/sitemap.xml`',
      '',
      '五处出口必须走同一批查询函数。只要有一处「另写一个 SQL」，过滤条件就会在那里失守。',
      '',
      '## 做法',
      '',
      '把 `status = \'published\'` 直接写进查询层的每一处公开读，而不是放在模板里做判断。',
      '模板过滤只能挡住「看得见的页面」，挡不住订阅源。',
    ].join('\n'),
    status: 'published',
    publishedAt: '2026-10-12T07:45:00Z',
    tagIds: [2, 4],
  },
  {
    slug: 'wip-monorepo-conventions',
    title: '（草稿）单仓协作约定整理中',
    summary: '尚未发布，仅用于验证草稿过滤在五处出口都生效。',
    contentMd: draftMd,
    status: 'draft',
    publishedAt: null,
    tagIds: [4],
  },
];

const timeline = [
  { period: '2026', title: '独立开发者', description: '专注于边缘计算与前端性能方向的产品实现。' },
  { period: '2024 — 2025', title: '高级前端工程师', description: '主导前端性能治理，把首屏指标纳入发布门禁。' },
  { period: '2022 — 2024', title: '全栈工程师', description: '负责数据服务与后台工具链的设计与落地。' },
  { period: '2021', title: '开始写技术博客', description: '把踩过的坑整理成文，坚持先讲清楚问题再给方案。' },
];

// ---------------------------------------------------------------------------
// 组装 SQL
// ---------------------------------------------------------------------------

const statements: string[] = [];

// 清空内容表：先删子表再删父表，避免外键约束报错。
// settings 也必须清空后重写，否则 content_version 的旧行会与 INSERT 撞主键。
statements.push(
  [
    'DELETE FROM post_tags;',
    'DELETE FROM project_tags;',
    'DELETE FROM skills;',
    'DELETE FROM skill_groups;',
    'DELETE FROM projects;',
    'DELETE FROM posts;',
    'DELETE FROM tags;',
    'DELETE FROM timeline_items;',
    'DELETE FROM messages;',
    'DELETE FROM profile;',
    'DELETE FROM settings;',
    'DELETE FROM content_revisions;',
    'DELETE FROM media;',
  ].join('\n'),
);

statements.push(
  insert(
    'profile',
    [
      'id', 'display_name', 'headline', 'about_md', 'avatar_key', 'location',
      'status', 'email', 'resume_key', 'social_links', 'hidden_fields',
    ],
    [[
      1,
      '陈知远',
      '全栈工程师 · 关注边缘计算与前端性能',
      aboutMd,
      null,
      '杭州',
      '开放远程合作',
      'hi@example.com',
      null,
      json([
        { label: 'GitHub', url: 'https://github.com/example', icon: 'github' },
        { label: '邮箱', url: 'mailto:hi@example.com', icon: 'mail' },
      ]),
      json([]),
    ]],
  ),
);

statements.push(
  insert(
    'settings',
    ['key', 'value', 'updated_at'],
    [
      ['site_title', json('陈知远 · 个人网站'), '2026-10-19T00:00:00Z'],
      ['site_subtitle', json('项目、文章与一些工程上的取舍记录'), '2026-10-19T00:00:00Z'],
      ['footer_text', json('用 Astro 与 Cloudflare 构建，内容与代码同源。'), '2026-10-19T00:00:00Z'],
      ['default_share_image', json(''), '2026-10-19T00:00:00Z'],
      ['accent_color', json(''), '2026-10-19T00:00:00Z'],
      // 版本号取当前秒级时间戳：每次 seed 都得到一个更大的新值，
      // 保证上一轮 seed 产生的缓存键立即失效（见 cache.ts 的键规则）。
      ['content_version', String(Math.floor(Date.now() / 1000)), '2026-10-19T00:00:00Z'],
    ],
  ),
);

statements.push(insert('tags', ['id', 'name', 'slug'], tagRows));

const skillGroupRows: (string | number)[][] = [];
const skillRows: (string | number | null)[][] = [];
skillGroups.forEach((group, groupIndex) => {
  skillGroupRows.push([groupIndex + 1, group.name, groupIndex]);
  group.skills.forEach((skill, skillIndex) => {
    skillRows.push([groupIndex + 1, skill.name, skill.level, skillIndex, 1]);
  });
});

statements.push(insert('skill_groups', ['id', 'name', 'sort_order'], skillGroupRows));
statements.push(
  insert('skills', ['group_id', 'name', 'level', 'sort_order', 'visible'], skillRows),
);

const projectRows: (string | number | null)[][] = [];
const projectTagRows: (string | number)[][] = [];
projects.forEach((project, index) => {
  projectRows.push([
    index + 1,
    project.slug,
    project.title,
    project.summary,
    project.contentMd,
    null,
    'https://github.com/example/' + project.slug,
    null,
    project.status,
    project.featured ? 1 : 0,
    index,
    null,
    null,
  ]);
  project.tagIds.forEach((tagId) => projectTagRows.push([index + 1, tagId]));
});

statements.push(
  insert(
    'projects',
    [
      'id', 'slug', 'title', 'summary', 'content_md', 'cover_key', 'repo_url', 'demo_url',
      'status', 'featured', 'sort_order', 'started_at', 'ended_at',
    ],
    projectRows,
  ),
);
statements.push(insert('project_tags', ['project_id', 'tag_id'], projectTagRows));

const postRows: (string | number | null)[][] = [];
const postTagRows: (string | number)[][] = [];
posts.forEach((post, index) => {
  postRows.push([
    index + 1,
    post.slug,
    post.title,
    post.summary,
    post.contentMd,
    null,
    post.status,
    post.publishedAt,
    // 阅读时长由共享包估算，保证与前台展示用的同一套口径
    estimateReadingMinutes(post.contentMd),
    0,
  ]);
  post.tagIds.forEach((tagId) => postTagRows.push([index + 1, tagId]));
});

statements.push(
  insert(
    'posts',
    [
      'id', 'slug', 'title', 'summary', 'content_md', 'cover_key', 'status',
      'published_at', 'reading_minutes', 'view_count',
    ],
    postRows,
  ),
);
statements.push(insert('post_tags', ['post_id', 'tag_id'], postTagRows));

statements.push(
  insert(
    'timeline_items',
    ['id', 'period', 'title', 'description', 'sort_order'],
    timeline.map((item, index) => [index + 1, item.period, item.title, item.description, index]),
  ),
);

statements.push(
  insert(
    'messages',
    ['name', 'email', 'subject', 'body', 'status', 'ip_hash'],
    [
      ['王小明', 'wang@example.com', '合作咨询', '你好，想聊一个边缘渲染的合作，方便的话请回复邮件。', 'new', 'seed-hash-1'],
      ['李工', 'li@example.com', null, '博客里关于缓存版本号那篇很有帮助，已收藏。', 'handled', 'seed-hash-2'],
    ],
  ),
);

const sql = [
  '-- 由 scripts/seed.ts 自动生成，请勿手工编辑。',
  statements.join('\n\n'),
  '',
].join('\n');

mkdirSync(path.dirname(sqlPath), { recursive: true });
writeFileSync(sqlPath, sql, 'utf8');

// ---------------------------------------------------------------------------
// 交给 wrangler 执行
// ---------------------------------------------------------------------------

const target = remote ? '--remote' : '--local';
console.log(`[seed] 写入 ${remote ? '线上' : '本地'} D1（${DATABASE_NAME}）…`);

const command = `pnpm.cmd exec wrangler d1 execute ${DATABASE_NAME} ${target} --file="${sqlPath}"`;
const result = spawnSync(command, { shell: true, stdio: 'inherit', cwd: projectRoot });

if (result.status !== 0) {
  console.error('[seed] 执行失败。若为 --remote，请确认 wrangler.toml 中的 database_id 已替换为真实值。');
  process.exit(result.status ?? 1);
}

console.log(`[seed] 完成：${posts.length} 篇文章（含 ${posts.filter((p) => p.status === 'draft').length} 篇草稿）、${projects.length} 个项目、${types.length} 个标签。`);
