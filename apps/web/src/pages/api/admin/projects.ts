/**
 * 项目管理接口（F3）。
 *
 * GET 是后台列表：包含全部状态（active/completed/archived），不按状态过滤 —— 归档项目也要能在后台编辑。
 * POST 新建项目（repository 内部会处理标签关联并自增 content_version）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery, totalPages } from '@portfolio/shared/query';
import { projectInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { countProjects, createProject, listProjects } from '../../../lib/server/repositories/projects';
import { readJsonBody, requireAdmin } from './_shared';

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const { page, pageSize, offset } = parsePageQuery(url.searchParams);
    const db = getDb();
    const [items, total] = await Promise.all([
      listProjects(db, { limit: pageSize, offset }),
      countProjects(db),
    ]);

    return jsonResponse(
      ok({ items }, { page, pageSize, total, totalPages: totalPages(total, pageSize) }),
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return internalErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = projectInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    const id = await createProject(getDb(), parsed.data);
    return jsonResponse(ok({ id }), { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
