/**
 * 个人信息管理接口（F1）。
 *
 * GET 返回**含隐藏字段**的原始数据：后台编辑表单需要看到 hidden_fields 才能标记「哪些字段当前不公开」，
 * 与公开接口 /api/profile（会剔除隐藏字段）刻意不同。
 * PUT 用 profileUpdateSchema 校验后整体覆盖保存，repository 内部会与自增 content_version 放进同一 batch。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { profileUpdateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { getProfile, updateProfile } from '../../../lib/server/repositories/profile';
import { readJsonBody, requireAdmin } from './_shared';

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const profileData = await getProfile(getDb());
    // profile 可能为 null（尚未初始化），空结果仍是成功（AGENTS.md §4.1）
    return jsonResponse(ok(profileData), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = profileUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    await updateProfile(getDb(), parsed.data);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
