/**
 * 单篇文章的更新与删除（F4）。
 *
 * 删除是破坏性操作：先按 id 取回含正文的完整文章，落一份 content_revisions 快照后再删（AGENTS.md §4.3）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { postInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { getDb } from '../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../lib/server/http';
import { createRevision } from '../../../../lib/server/repositories/revisions';
import { deletePost, getPostById, updatePost } from '../../../../lib/server/repositories/posts';
import { parseEntityId, readJsonBody, requireAdmin } from '../_shared';

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '文章不存在。', { status: 404 });

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = postInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', '提交内容有误，请检查后重试。', {
      status: 400,
      fields: toFieldErrors(parsed.error),
    });
  }

  try {
    await updatePost(getDb(), id, parsed.data);
    return jsonResponse(ok({ saved: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '文章不存在。', { status: 404 });

  try {
    const db = getDb();
    const post = await getPostById(db, id);
    if (!post) return errorResponse('NOT_FOUND', '文章不存在。', { status: 404 });

    await createRevision(db, 'post', id, post, '删除文章前的快照');
    await deletePost(db, id);

    return jsonResponse(ok({ deleted: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
