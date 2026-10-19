/**
 * 留言提交接口（公开写入，PRD F6）。
 *
 * 三道防线（贪心但便宜）：
 * 1. Zod 严格校验（长度上限，防超长载荷）
 * 2. 蜜罐字段：填了就当垃圾处理，但**仍返回成功**，不给爬虫任何反馈
 * 3. 按 IP 哈希的频率限制：10 分钟窗口内最多 3 条
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { HONEYPOT_FIELD, messageCreateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../lib/server/db';
import {
  countRecentMessagesByIp,
  createMessage,
  hashIp,
} from '../../lib/server/repositories/messages';
import { errorResponse, jsonResponse, NO_STORE_HEADERS } from '../../lib/server/http';
import { getRuntimeEnv } from '../../lib/server/runtime-env';

/** 频率限制参数。个人站的合理阈值：正常访客不会在 10 分钟内留 3 次言。 */
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_MESSAGES = 3;

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('VALIDATION_FAILED', '请求体不是合法的 JSON。', { status: 400 });
  }

  const parsed = messageCreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  const runtimeEnv = getRuntimeEnv();
  const db = getDb();

  // 蜜罐命中：静默丢弃，但返回成功 —— 让爬虫以为提交成功，避免它换策略重试
  if (parsed.data[HONEYPOT_FIELD]) {
    return jsonResponse(ok({ accepted: true }), { headers: NO_STORE_HEADERS });
  }

  const connectingIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipSalt = runtimeEnv.MESSAGE_IP_SALT ?? runtimeEnv.SITE_URL ?? 'portfolio-default-salt';
  const ipHash = await hashIp(connectingIp, ipSalt);

  // 频率限制：超限时返回 429，并明确告知稍后再试
  const recentCount = await countRecentMessagesByIp(db, ipHash, RATE_LIMIT_WINDOW_MINUTES);
  if (recentCount >= RATE_LIMIT_MAX_MESSAGES) {
    return errorResponse('RATE_LIMITED', '留言过于频繁，请稍后再试。', { status: 429 });
  }

  try {
    const id = await createMessage(db, {
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject ?? null,
      body: parsed.data.body,
      ipHash,
    });
    return jsonResponse(ok({ id }), { headers: NO_STORE_HEADERS });
  } catch {
    // 数据库不可用时如实报错，不假装成功（否则访客以为留言已送达）
    return errorResponse('INTERNAL_ERROR', '留言保存失败，请稍后再试或改用邮件联系。', { status: 500 });
  }
};
