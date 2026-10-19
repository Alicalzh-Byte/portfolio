/**
 * 文章管理接口（F4）。
 *
 * GET 是后台列表：包含草稿。草稿过滤只发生在公开出口（repositories 的公开读方法里写死 status='published'），
 * 后台必须能看到草稿，否则无法继续编辑。支持 `?status=draft|published|all` 过滤。
 * POST 新建文章（阅读时长由正文自动估算，发布时间由 repository 决定）。
 */
import type { APIRoute } from 'astro';
import type { ContentStatus } from '@portfolio/shared/types';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery } from '@portfolio/shared/query';
import { postInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { createPost, listPostsForAdmin } from '../../../lib/server/repositories/posts';
import { readJsonBody, requireAdmin } from './_shared';

/** 把查询参数收敛成合法状态值；非法值按 all 处理（与前台分页参数「容错」一致）。 */
function toStatusFilter(raw: string | null): ContentStatus | 'all' {
  return raw === 'draft' || raw === 'published' ? raw : 'all';
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const { pageSize, offset } = parsePageQuery(url.searchParams);
    const status = toStatusFilter(url.searchParams.get('status'));
    const items = await listPostsForAdmin(getDb(), { limit: pageSize, offset, status });

    // posts 仓库未提供后台视角的计数函数，因此这里不返回 total 元信息（meta 可选）
    return jsonResponse(ok({ items }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = postInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    const id = await createPost(getDb(), parsed.data);
    return jsonResponse(ok({ id }), { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
