/**
 * 文章发布接口（F4）：把草稿切成已发布，并补上首次发布时间。
 *
 * 先取一次实体做存在性检查：publishPost 是 UPDATE，对不存在的 id 不会报错，
 * 若不检查会把「不存在的文章」也返回成功，后台会误以为已发布。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { getDb } from '../../../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../../../lib/server/http';
import { getPostById, publishPost } from '../../../../../lib/server/repositories/posts';
import { parseEntityId, requireAdmin } from '../../_shared';

export const POST: APIRoute = async ({ params, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const id = parseEntityId(params.id);
  if (id === null) return errorResponse('NOT_FOUND', '文章不存在。', { status: 404 });

  try {
    const db = getDb();
    const post = await getPostById(db, id);
    if (!post) return errorResponse('NOT_FOUND', '文章不存在。', { status: 404 });

    await publishPost(db, id);
    return jsonResponse(ok({ published: true }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
