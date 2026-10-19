/**
 * 单条留言的处理与删除（F6）。
 *
 * PATCH 用于标记状态（new / handled / spam）；DELETE 用于彻底删除。
 * content_revisions 的 entity_type 不含 'message'，且留言不属于「展示在页面上的内容」，
 * 因此这里不落快照（留言的删除不可回滚，属已知限制）。
 */
import type { APIRoute } from 'astro';
import type { MessageStatus } from '@portfolio/shared/types';
import { ok } from '@portfolio/shared/api';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { deleteMessage, updateMessageStatus } from '../../../../lib/server/repositories/messages';
import { parseEntityId, readJsonBody, requireAdmin } from '../_shared';

const MESSAGE_STATUSES = ['new', 'handled', 'spam'] as const;

function isMessageStatus(value: unknown): value is MessageStatus {
  return typeof value === 'string' && (MESSAGE_STATUSES as readonly string[]).includes(value);
}

/** 从无类型的请求体里取出 status 字段（用 unknown 收窄，不使用 any）。 */
function readStatusField(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as { status?: unknown }).status;
}

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '留言不存在。', { status: 404 });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const status = readStatusField(body.value);
  if (!isMessageStatus(status)) {
    return errorResponse('VALIDATION_FAILED', '留言状态不合法。', {
      status: 400,
      fields: { status: '只能是 new / handled / spam' },
    });
  }

  try {
    await updateMessageStatus(getDb(), id, status);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '留言不存在。', { status: 404 });

  try {
    await deleteMessage(getDb(), id);
    return jsonResponse(ok({ deleted: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
