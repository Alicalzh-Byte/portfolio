/**
 * 领域类型定义。
 *
 * 命名约定：数据库用 snake_case，TS 用 camelCase；此处是「库 → 应用」之间的映射结果，
 * 因此全部为 camelCase。字段可空性严格对齐 migrations/0001_init.sql，改动字段时必须同步三处：
 * 迁移文件、本文件、schemas.ts。
 */

/** 内容发布状态。草稿不得出现在任何公开出口（列表 / RSS / sitemap）。 */
export type ContentStatus = 'draft' | 'published';

/** 项目状态。归档项目不出现在首页精选（PRD AC3.4）。 */
export type ProjectStatus = 'active' | 'completed' | 'archived';

/** 留言处理状态。 */
export type MessageStatus = 'new' | 'handled' | 'spam';

/** 可被快照回滚的实体类型（content_revisions.entity_type）。 */
export type RevisionEntityType = 'profile' | 'project' | 'post' | 'settings' | 'skill_group' | 'timeline';

/** 社交链接条目。存储在 profile.social_links 的 JSON 数组里。 */
export type SocialLink = {
  label: string;
  url: string;
  /** 可选图标名（前端映射到内联 SVG，不引入图标库） */
  icon?: string;
};

/** profile 表：单行（id 固定为 1）。 */
export type Profile = {
  id: number;
  displayName: string;
  headline: string | null;
  aboutMd: string | null;
  avatarKey: string | null;
  location: string | null;
  status: string | null;
  email: string | null;
  resumeKey: string | null;
  socialLinks: SocialLink[];
  /** 不公开的字段名列表，读取时由服务端剔除（PRD AC1.2） */
  hiddenFields: string[];
  updatedAt: string;
};

/** skills 表。 */
export type Skill = {
  id: number;
  groupId: number;
  name: string;
  icon: string | null;
  /** 熟练度 1~5，为空时前端不渲染进度条（PRD AC2.2） */
  level: number | null;
  sortOrder: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
};

/** skill_groups 表，附带其下技能（列表接口一次取回，避免 N+1）。 */
export type SkillGroup = {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  skills: Skill[];
};

/** tags 表，文章与项目共用。 */
export type Tag = {
  id: number;
  name: string;
  slug: string;
};

/** 带内容数量的标签（标签聚合页与筛选器用）。 */
export type TagWithCount = Tag & {
  postCount: number;
  projectCount: number;
};

/** projects 表。 */
export type Project = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  contentMd: string | null;
  coverKey: string | null;
  repoUrl: string | null;
  demoUrl: string | null;
  status: ProjectStatus;
  featured: boolean;
  sortOrder: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
};

/** projects 的列表视图：不含正文，避免列表页载荷过大。 */
export type ProjectSummary = Omit<Project, 'contentMd'>;

/** posts 表。 */
export type Post = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  contentMd: string;
  coverKey: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  readingMinutes: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
};

/** posts 的列表视图。 */
export type PostSummary = Omit<Post, 'contentMd'>;

/** 渲染后的文章详情：正文 HTML + 目录（列表接口不返回这两项）。 */
export type RenderedPost = PostSummary & {
  html: string;
  toc: TocItem[];
};

/** 渲染后的项目详情。 */
export type RenderedProject = ProjectSummary & {
  html: string;
  toc: TocItem[];
};

/** Markdown 标题锚点目录项。 */
export type TocItem = {
  id: string;
  text: string;
  depth: number;
};

/** media 表：R2 中真实文件的索引（不直接暴露公开桶，走受控路由）。 */
export type Media = {
  id: number;
  key: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  originalName: string | null;
  createdAt: string;
};

/** 图片被引用的情况（删除前提示影响范围，PRD AC5.5）。 */
export type MediaUsage = {
  key: string;
  usedBy: { entityType: string; entityId: number; title: string }[];
};

/** messages 表。ip_hash 为哈希，不存明文 IP。 */
export type Message = {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  body: string;
  status: MessageStatus;
  createdAt: string;
};

/** content_revisions 表：变更前快照，用于回滚。 */
export type ContentRevision = {
  id: number;
  entityType: RevisionEntityType;
  entityId: number;
  snapshot: string;
  note: string | null;
  createdAt: string;
};

/** timeline_items 表：关于页「经历时间线」的条目（内容必须来自 D1，不得硬编码）。 */
export type TimelineItem = {
  id: number;
  period: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** settings 表：站点级键值配置。content_version 是缓存失效的核心（TECH_DESIGN §4.2）。 */
export type Settings = {
  siteTitle: string;
  siteSubtitle: string;
  defaultShareImage: string | null;
  accentColor: string | null;
  footerText: string;
  contentVersion: number;
};
