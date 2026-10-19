/**
 * 技能分组管理接口（F2）。
 *
 * GET 传 visibleOnly=false：后台需要看到隐藏技能，才能把它们重新设为可见；
 * 前台走公开接口，只拿可见项。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { skillGroupInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { createSkillGroup, listSkillGroups } from '../../../lib/server/repositories/skills';
import { readJsonBody, requireAdmin } from './_shared';

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const items = await listSkillGroups(getDb(), false);
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

  const parsed = skillGroupInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    const id = await createSkillGroup(getDb(), parsed.data.name, parsed.data.sortOrder);
    return jsonResponse(ok({ id }), { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
