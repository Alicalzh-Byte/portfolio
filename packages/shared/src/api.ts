/**
 * 统一 API 契约：路径常量 + 响应信封类型 + 信封构造工具。
 *
 * 约定（AGENTS.md §4.1）：
 * - 成功：{ ok: true, data, meta? }
 * - 失败：{ ok: false, error: { code, message, fields? } }
 * - 列表接口一律返回 data: { items: [] }，空结果也是成功，绝不返回 null。
 */

/** 错误码集合。新增错误码前先想清楚前端要如何据此展示。 */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** 分页元信息。 */
export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** 列表载荷的统一容器语义。 */
export type ListData<T> = {
  items: T[];
};

export type ApiSuccess<T, M = undefined> = M extends undefined
  ? { ok: true; data: T }
  : { ok: true; data: T; meta: M };

export type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** 字段级错误：{ 字段名: 错误说明 }，供后台定位到具体输入框 */
    fields?: Record<string, string>;
  };
};

export type ApiResult<T, M = undefined> = ApiSuccess<T, M> | ApiFailure;

/** 构造成功响应。 */
export function ok<T>(data: T): ApiSuccess<T>;
export function ok<T, M>(data: T, meta: M): ApiSuccess<T, M>;
export function ok<T, M>(data: T, meta?: M): ApiSuccess<T, M> {
  // 实现签名要同时覆盖两个重载。M 是泛型时 ApiSuccess<T, M> 属于「未解析的条件类型」，
  // TS 无法直接判定对象字面量属于它，故此处显式断言；调用方看到的仍是重载给出的精确类型。
  return (meta === undefined ? { ok: true, data } : { ok: true, data, meta }) as ApiSuccess<T, M>;
}

/** 构造失败响应。fields 用于回传字段级校验错误。 */
export function fail(
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): ApiFailure {
  return fields === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, fields } };
}

/** 公开只读接口路径（可被 CDN 缓存）。 */
export const PUBLIC_API = {
  profile: '/api/profile',
  skills: '/api/skills',
  projects: '/api/projects',
  project: (slug: string) => `/api/projects/${encodeURIComponent(slug)}`,
  posts: '/api/posts',
  post: (slug: string) => `/api/posts/${encodeURIComponent(slug)}`,
  tags: '/api/tags',
  messages: '/api/messages',
} as const;

/** 受保护接口路径（Access 边缘放行 + 应用内 JWT 二次校验）。 */
export const ADMIN_API = {
  profile: '/api/admin/profile',
  skills: '/api/admin/skills',
  skillGroups: '/api/admin/skill-groups',
  projects: '/api/admin/projects',
  posts: '/api/admin/posts',
  postPublish: (id: number) => `/api/admin/posts/${id}/publish`,
  media: '/api/admin/media',
  settings: '/api/admin/settings',
  messages: '/api/admin/messages',
  export: '/api/admin/export',
} as const;
