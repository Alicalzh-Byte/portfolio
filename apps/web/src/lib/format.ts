/**
 * 展示层格式化工具（纯函数，无 IO）。
 * 数据库里存 UTC ISO 8601，展示时才转人类可读格式（TECH_DESIGN §3.1 原则 4）。
 */

/**
 * 格式化日期。
 *
 * 注意：这里用运行环境的本地时区渲染（本地 dev 是 Asia/Shanghai，Workers 是 UTC）。
 * 若需要「无论部署在哪都固定展示某个时区」，应由 settings 提供一个时区字段并传进来，
 * 届时再改这里 —— 目前不为此增加配置项。
 */
export function formatDate(utcString: string | null): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(date);
}

/** 只取年月，用于时间线。 */
export function formatMonth(utcString: string | null): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit' }).format(date);
}

/**
 * R2 对象 key → 受控的公开读取路径。
 * 不直接暴露 R2 桶域名：图片经由 /media/* 的 Pages Function 读取，
 * 这样将来要加访问策略或改存储都不用动页面代码。
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * 头像缺失时的首字母占位（PRD AC1.3：不出现破图）。
 * 中文名取第一个字，英文名取首字母。
 */
export function nameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0] ?? '·';
}

/** 组装 mailto 链接；没有邮箱时返回 null，让模板直接不渲染入口。 */
export function mailtoHref(email: string | null | undefined): string | null {
  if (!email) return null;
  return `mailto:${email}`;
}

/** 由 slug 生成站内路径。 */
export function projectHref(slug: string): string {
  return `/projects/${slug}`;
}

export function postHref(slug: string): string {
  return `/blog/${slug}`;
}

export function tagHref(slug: string): string {
  return `/tags/${slug}`;
}
