/**
 * Zod 校验 —— 所有入参校验的唯一来源（AGENTS.md §4.1）。
 *
 * 路由层只做「校验 → 调用 repository → 组装响应」，校验规则必须从这里取，
 * 后台表单也复用同一套 schema，保证「前端能填的 == 后端能收的」。
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * 基础片段
 * ------------------------------------------------------------------ */

/** slug：英文短语，用于 URL。禁止中文与时间戳（PRD §7 命名规范）。 */
const slugField = z
  .string()
  .trim()
  .min(1, 'slug 不能为空')
  .max(80, 'slug 过长')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug 只能是小写字母、数字与连字符');

/**
 * URL：只允许 http/https，挡掉 `javascript:` 之类的协议。
 * 不用 z.string().url()（该 API 在 zod 各版本间有差异），显式正则更可控。
 */
const httpUrlField = z
  .string()
  .trim()
  .max(500, '链接过长')
  .regex(/^https?:\/\/[^\s]+$/i, '链接必须以 http:// 或 https:// 开头');

/** UTC ISO 8601 字符串。数据库里只存 UTC，展示层再转本地时区。 */
const utcDateTimeField = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), '时间格式不合法（需 UTC ISO 8601）');

/** R2 object key：由服务端生成，形如 2026/10/uuid.webp。 */
const mediaKeyField = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^\d{4}\/\d{2}\/[A-Za-z0-9._-]+$/, '图片 key 格式不合法');

/** 邮箱：不用 z.string().email()，改用显式正则以规避 zod 版本间 API 差异。 */
const emailField = z
  .string()
  .trim()
  .max(254, '邮箱过长')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确');

/* ------------------------------------------------------------------ *
 * profile（F1）
 * ------------------------------------------------------------------ */

export const socialLinkSchema = z.object({
  label: z.string().trim().min(1, '标签不能为空').max(30),
  url: httpUrlField,
  icon: z.string().trim().max(30).optional(),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1, '姓名不能为空').max(60),
  headline: z.string().trim().max(120).nullish(),
  aboutMd: z.string().max(20_000).nullish(),
  avatarKey: mediaKeyField.nullish(),
  location: z.string().trim().max(60).nullish(),
  status: z.string().trim().max(40).nullish(),
  email: emailField.nullish(),
  resumeKey: mediaKeyField.nullish(),
  socialLinks: z.array(socialLinkSchema).max(12, '社交链接最多 12 条').default([]),
  /** 设置为不公开的字段名；未列出的字段视为公开（PRD AC1.2） */
  hiddenFields: z.array(z.string().trim().min(1)).default([]),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/* ------------------------------------------------------------------ *
 * 技能（F2）
 * ------------------------------------------------------------------ */

export const skillGroupInputSchema = z.object({
  name: z.string().trim().min(1, '分组名不能为空').max(40),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const skillInputSchema = z.object({
  groupId: z.coerce.number().int().positive('必须归属某个分组'),
  name: z.string().trim().min(1, '技能名不能为空').max(40),
  icon: z.string().trim().max(40).nullish(),
  /** 1~5 档；为空表示不展示熟练度（PRD AC2.2 不渲染空进度条） */
  level: z.coerce.number().int().min(1).max(5).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  visible: z.boolean().default(true),
});

/** 拖拽排序：一次提交整组的顺序，避免逐条 PATCH 造成中间态。 */
export const reorderSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, '排序列表不能为空'),
});

/* ------------------------------------------------------------------ *
 * 项目（F3）
 * ------------------------------------------------------------------ */

export const projectInputSchema = z.object({
  slug: slugField,
  title: z.string().trim().min(1, '标题不能为空').max(120),
  summary: z.string().trim().max(200).nullish(),
  contentMd: z.string().max(60_000).nullish(),
  coverKey: mediaKeyField.nullish(),
  repoUrl: httpUrlField.nullish(),
  demoUrl: httpUrlField.nullish(),
  status: z.enum(['active', 'completed', 'archived']).default('active'),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  startedAt: utcDateTimeField.nullish(),
  endedAt: utcDateTimeField.nullish(),
  tagNames: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

/* ------------------------------------------------------------------ *
 * 文章（F4）
 * ------------------------------------------------------------------ */

export const postInputSchema = z.object({
  slug: slugField,
  title: z.string().trim().min(1, '标题不能为空').max(160),
  summary: z.string().trim().max(300).nullish(),
  contentMd: z.string().max(120_000).default(''),
  coverKey: mediaKeyField.nullish(),
  status: z.enum(['draft', 'published']).default('draft'),
  publishedAt: utcDateTimeField.nullish(),
  tagNames: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
});

export type PostInput = z.infer<typeof postInputSchema>;

/* ------------------------------------------------------------------ *
 * 留言（F6）
 * ------------------------------------------------------------------ */

/** 蜜罐字段名。爬虫会填它，真人看不见（AC6.2）。 */
export const HONEYPOT_FIELD = 'website';

export const messageCreateSchema = z.object({
  name: z.string().trim().min(1, '请填写称呼').max(60),
  email: emailField,
  subject: z.string().trim().max(120).nullish(),
  body: z.string().trim().min(1, '请填写留言内容').max(2000),
  /** 蜜罐：必须为空，填了就当垃圾处理（但对外仍返回成功，不给爬虫反馈） */
  [HONEYPOT_FIELD]: z.string().max(200).optional().default(''),
});

export type MessageCreateInput = z.infer<typeof messageCreateSchema>;

/* ------------------------------------------------------------------ *
 * 站点设置与时间线（F5 / 关于页）
 * ------------------------------------------------------------------ */

export const settingsUpdateSchema = z.object({
  siteTitle: z.string().trim().min(1, '站点标题不能为空').max(80),
  siteSubtitle: z.string().trim().max(160).default(''),
  defaultShareImage: mediaKeyField.nullish(),
  /** 只允许十六进制色值，挡掉把任意 CSS 注入站点标语的路径 */
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '请填写 #RRGGBB 格式的颜色')
    .nullish(),
  footerText: z.string().trim().max(200).default(''),
});

export const timelineItemInputSchema = z.object({
  period: z.string().trim().min(1, '时间段不能为空').max(60),
  title: z.string().trim().min(1, '标题不能为空').max(120),
  description: z.string().trim().max(600).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

/* ------------------------------------------------------------------ *
 * 图片上传（F5 · 媒体库）
 * ------------------------------------------------------------------ */

/** 单张上限 5MB（PRD AC5.4）。 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** 只接受这四种；**依据文件头魔数判定**，不看扩展名与 Content-Type。 */
export const ACCEPTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIMES)[number];

/**
 * 由文件头魔数判定真实 MIME。
 * 伪造扩展名（把脚本改名成 .png）会在这里被拒 —— 这是上传校验的关键一环（AC5.4）。
 * 返回 null 表示不是受支持的图片格式。
 */
export function detectImageMime(bytes: Uint8Array): AcceptedImageMime | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

  // GIF: "GIF87a" / "GIF89a"
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';

  // WebP: "RIFF" .... "WEBP"
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * 通用查询
 * ------------------------------------------------------------------ */

/** 把 Zod 的 issues 压成 `{ 字段: 说明 }`，直接喂给后台表单做字段级错误展示。 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '_';
    if (!(path in fieldErrors)) fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}
