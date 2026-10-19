/**
 * 站点设置管理接口（F5）。
 *
 * GET 返回完整设置（含 content_version）。
 * PUT 把各项设置写入语句与自增 content_version 放进**同一个 batch**：
 * D1 的 batch 在单事务内执行，保证「配置改了」与「缓存版本涨了」要么都成立、要么都不发生（AGENTS.md §4.3）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { settingsUpdateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { executeBatch, getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import {
  buildBumpContentVersionStatement,
  buildSetSettingStatement,
  getSettings,
} from '../../../lib/server/repositories/settings';
import { readJsonBody, requireAdmin } from './_shared';

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const settings = await getSettings(getDb());
    return jsonResponse(ok(settings), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = settingsUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  const db = getDb();
  if (!db) return internalErrorResponse();

  const input = parsed.data;
  try {
    await executeBatch(db, [
      buildSetSettingStatement('site_title', input.siteTitle),
      buildSetSettingStatement('site_subtitle', input.siteSubtitle),
      // 可空项统一落成空串：getSettings 解码时会把空串还原为 null，无需额外分支
      buildSetSettingStatement('default_share_image', input.defaultShareImage ?? ''),
      buildSetSettingStatement('accent_color', input.accentColor ?? ''),
      buildSetSettingStatement('footer_text', input.footerText),
      buildBumpContentVersionStatement(),
    ]);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
