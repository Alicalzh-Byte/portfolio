/**
 * 单个技能的更新与删除（F2）。
 *
 * deleteSkill 无对应 entity_type（content_revisions 的 CHECK 只允许 profile/project/post/settings/skill_group/timeline），
 * 因此删除技能时把**所属分组**作为快照主体：删技能改变的是分组内容，回滚时按分组恢复语义正确。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { skillInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { createRevision } from '../../../../lib/server/repositories/revisions';
import { deleteSkill, listSkillGroups, updateSkill } from '../../../../lib/server/repositories/skills';
import { parseEntityId, readJsonBody, requireAdmin } from '../_shared';

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '技能不存在。', { status: 404 });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = skillInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    await updateSkill(getDb(), id, {
      groupId: parsed.data.groupId,
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      level: parsed.data.level ?? null,
      sortOrder: parsed.data.sortOrder,
      visible: parsed.data.visible,
    });
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '技能不存在。', { status: 404 });

  try {
    const db = getDb();
    const groups = await listSkillGroups(db, false);
    const group = groups.find((item) => item.skills.some((skill) => skill.id === id));
    if (!group) return errorResponse('NOT_FOUND', '技能不存在。', { status: 404 });

    await createRevision(db, 'skill_group', group.id, group, '删除技能前的分组快照');
    await deleteSkill(db, id);

    return jsonResponse(ok({ deleted: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
