/**
 * 技能新增接口（F2）。
 * 分组管理走 /api/admin/skill-groups，这里只负责往分组里加技能项。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { skillInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { createSkill } from '../../../lib/server/repositories/skills';
import { readJsonBody, requireAdmin } from './_shared';

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

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
    const id = await createSkill(getDb(), {
      groupId: parsed.data.groupId,
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      level: parsed.data.level ?? null,
      sortOrder: parsed.data.sortOrder,
      visible: parsed.data.visible,
    });
    return jsonResponse(ok({ id }), { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
