/**
 * 后台接口的共用小工具。
 *
 * 文件名以下划线开头：Astro 路由器会忽略这类文件，因此它不会变成一条路由；
 * 但仍会被 tsc 纳入类型检查（tsconfig 的 include 覆盖 src/**\/*.ts）。
 * 只放「与业务无关、且每个管理端点都要做」的三件事：鉴权兜底、ID 解析、JSON 体读取。
 */
import { errorResponse } from '../../../lib/server/http';

/**
 * 鉴权兜底。
 *
 * middleware 已对 /api/admin/* 校验过 Access JWT 并写入 locals.adminEmail（AGENTS.md §4.2 双层防线）。
 * 这里再判一次，是为了在中间件路径被误改、保护前缀遗漏时不把数据泄漏出去。
 * 返回 null 表示放行；否则返回可直接抛出的 401 响应。
 */
export function requireAdmin(locals: App.Locals): Response | null {
  if (locals.adminEmail) return null;
  return errorResponse('UNAUTHORIZED', '需要登录后台才能访问。', { status: 401 });
}

/** 解析路径参数里的数字 id；非正整数一律返回 null，由调用方转成 404。 */
export function parseEntityId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** JSON 请求体的读取结果：要么拿到值，要么拿到可直接返回的 400 响应。 */
export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

/** 读取 JSON 体。解析失败返回 400，而不是把 SyntaxError 抛成 500。 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: errorResponse('VALIDATION_FAILED', '请求体不是合法的 JSON。', { status: 400 }),
    };
  }
}
