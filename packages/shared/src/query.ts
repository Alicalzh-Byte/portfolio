/**
 * 查询参数解析的纯函数集合。
 *
 * 放在 shared 的原因：前台页面、公开接口、后台列表三处都要用同一套分页/筛选规则，
 * 各写一套极易出现「前台第 1 页有 10 条、接口第 1 页有 8 条」这类不一致。
 * 全部为纯函数，不依赖任何运行时 API（可在浏览器 / Workers / 测试中运行）。
 */

/** 分页默认与上限。上限存在的意义是防止一次把整库拉出来（Workers CPU 与 D1 读行数都有配额）。 */
export const PAGINATION = {
  defaultPageSize: 10,
  maxPageSize: 50,
} as const;

export type ParsedPageQuery = {
  page: number;
  pageSize: number;
  offset: number;
};

/**
 * 最小查询参数接口：只声明本文件真正用到的两个方法。
 *
 * 刻意不写死 `URLSearchParams`：该类型由各运行时的 lib 提供（浏览器 DOM lib / Workers 类型 / Node），
 * 本项目 tsconfig 的 lib 只有 ES2022，写死会让本包强依赖 DOM lib。
 * `URLSearchParams` 实例天然满足这个结构，调用方无需改动。
 */
export type QueryParams = {
  get(name: string): string | null;
  getAll(name: string): string[];
};

/**
 * 从查询参数解析分页。
 * 非法值（0、负数、非数字、超上限）一律回退到安全值，不抛错——分页参数错误不值得让页面 500。
 */
export function parsePageQuery(params: QueryParams): ParsedPageQuery {
  const page = toPositiveInt(params.get('page'), 1);
  const rawSize = toPositiveInt(params.get('pageSize'), PAGINATION.defaultPageSize);
  const pageSize = Math.min(rawSize, PAGINATION.maxPageSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * 解析标签筛选参数。
 * 支持 `?tag=a&tag=b` 与 `?tag=a,b` 两种写法，因为 URL 由不同入口拼接（前台筛选器 / 后台链接）。
 * 返回去重后的 slug 列表，空串被丢弃。
 */
export function parseTagParams(params: QueryParams): string[] {
  const collected = params.getAll('tag').flatMap((raw) => raw.split(','));
  const normalized = collected.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0);
  return Array.from(new Set(normalized));
}

/**
 * 解析布尔查询参数。只认 '1' / 'true'（大小写不敏感），其余一律 false。
 * 不使用 `Boolean(value)`，因为 `Boolean('false')` 是 true——这是最常见的隐式转换坑。
 */
export function parseBoolean(value: string | null): boolean {
  if (value === null) return false;
  const lowered = value.trim().toLowerCase();
  return lowered === '1' || lowered === 'true';
}

/** 由总数与分页参数算出总页数（至少 1 页，保证空列表也有可渲染的分页结构）。 */
export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

function toPositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

/**
 * 生成 slug：仅保留小写字母、数字与连字符，用于文章/项目的 URL 片段。
 * 中文标题会得到空串，此时调用方必须要求站主手填英文 slug（PRD 命名规范）。
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
