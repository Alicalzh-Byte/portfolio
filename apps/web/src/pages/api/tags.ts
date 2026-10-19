/** 标签接口（公开只读）。数量只统计已发布文章，草稿不外泄。 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { loadTags } from '../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../lib/server/http';

export const GET: APIRoute = async () => {
  const items = await loadTags();
  return jsonResponse(ok({ items }), { headers: PUBLIC_CACHE_HEADERS });
};
