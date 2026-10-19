/**
 * 单个项目的更新与删除（F3）。
 *
 * 删除是破坏性操作，必须先落一份 content_revisions 快照（AGENTS.md §4.3）。
 * ⚠️ projects 仓库只提供「按 slug 取详情」，没有按 id 取详情的函数；
 *    受「不得修改 lib/**」约束，这里用列表接口反查得到删除前实体（列表视图不含正文，属已知限制）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { projectInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { createRevision } from '../../../../lib/server/repositories/revisions';
import { deleteProject, listProjects, updateProject } from '../../../../lib/server/repositories/projects';
import { parseEntityId, readJsonBody, requireAdmin } from '../_shared';

/** 反查实体用的扫描上限：个人站的项目数量级远小于此，一次性取回避免分页遗漏。 */
const PROJECT_SNAPSHOT_SCAN_LIMIT = 10_000;

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '项目不存在。', { status: 404 });

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
    await updateProject(getDb(), id, parsed.data);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '项目不存在。', { status: 404 });

  try {
    const db = getDb();
    const items = await listProjects(db, { limit: PROJECT_SNAPSHOT_SCAN_LIMIT, offset: 0 });
    const project = items.find((item) => item.id === id);
    if (!project) return errorResponse('NOT_FOUND', '项目不存在。', { status: 404 });

    await createRevision(db, 'project', id, project, '删除项目前的快照');
    await deleteProject(db, id);

    return jsonResponse(ok({ deleted: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
