/**
 * 单个技能分组的更新与删除（F2）。
 *
 * 删除是破坏性操作：skills 表上有 ON DELETE CASCADE，删分组会连带清空组内技能，
 * 因此先落一份 content_revisions 快照（AGENTS.md §4.3），保证可回滚。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { skillGroupInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { createRevision } from '../../../../lib/server/repositories/revisions';
import {
  deleteSkillGroup,
  listSkillGroups,
  updateSkillGroup,
} from '../../../../lib/server/repositories/skills';
import { parseEntityId, readJsonBody, requireAdmin } from '../_shared';

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '技能分组不存在。', { status: 404 });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = skillGroupInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    await updateSkillGroup(getDb(), id, parsed.data.name, parsed.data.sortOrder);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '技能分组不存在。', { status: 404 });

  try {
    const db = getDb();
    const groups = await listSkillGroups(db, false);
    const group = groups.find((item) => item.id === id);
    if (!group) return errorResponse('NOT_FOUND', '技能分组不存在。', { status: 404 });

    await createRevision(db, 'skill_group', id, group, '删除技能分组前的快照');
    await deleteSkillGroup(db, id);

    return jsonResponse(ok({ deleted: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
