/**
 * HTTP 响应工具（服务端专用）。
 *
 * 统一在这里设置响应头，保证所有接口的响应形状一致（AGENTS.md §4.1），
 * 也避免各处手写 content-type 时漏掉缓存或安全头。
 */
import type { ApiErrorCode } from '@portfolio/shared/api';
import { fail } from '@portfolio/shared/api';

/** 公开只读接口的缓存头。注意：边缘缓存键含 content_version，因此这里的 TTL 可以设得比较长。 */
export const PUBLIC_CACHE_HEADERS = {
  'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
} as const;

/** 受保护接口与动态响应的缓存头：绝不能被 CDN 缓存。 */
export const NO_STORE_HEADERS = {
  'cache-control': 'no-store, private',
} as const;

/** 基础安全头。这些是对外响应的底线，不依赖 Cloudflare 侧的配置。 */
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
} as const;

export function jsonResponse(
  payload: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

/** 统一的失败响应。字段级错误通过 fields 回传。 */
export function errorResponse(
  code: ApiErrorCode,
  message: string,
  init: { status?: number; fields?: Record<string, string> } = {},
): Response {
  return jsonResponse(fail(code, message, init.fields), {
    status: init.status ?? 400,
    headers: NO_STORE_HEADERS,
  });
}

/** 把未知异常收敛成统一的 500，不把堆栈或内部信息透给调用方。 */
export function internalErrorResponse(): Response {
  return errorResponse('INTERNAL_ERROR', '服务器内部错误，请稍后再试。', { status: 500 });
}
