/**
 * 技能排序接口（F2）。
 *
 * 一次性提交整组新顺序，而不是逐条 PATCH：逐条提交会留下「排到一半」的中间态，
 * 前台会看到闪烁的顺序（repositories/skills.ts 的 reorderSkills 已按此设计）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { reorderSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { reorderSkills } from '../../../../lib/server/repositories/skills';
import { readJsonBody, requireAdmin } from '../_shared';

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = reorderSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '排序列表不合法。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    await reorderSkills(getDb(), parsed.data.ids);
    return jsonResponse(ok({ reordered: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
