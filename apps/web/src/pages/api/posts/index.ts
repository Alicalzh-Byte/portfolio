/**
 * 文章列表接口（公开只读，PRD F4）。
 * 草稿由 repositories 的 SQL 过滤，这里拿不到草稿 —— 不做「前端隐藏」。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery, parseTagParams, totalPages } from '@portfolio/shared/query';
import { loadPostList } from '../../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../../lib/server/http';

export const GET: APIRoute = async ({ url }) => {
  const { page, pageSize } = parsePageQuery(url.searchParams);
  const tagSlugs = parseTagParams(url.searchParams);

  const { items, total } = await loadPostList({ page, pageSize, tagSlugs });

  return jsonResponse(ok({ items }, { page, pageSize, total, totalPages: totalPages(total, pageSize) }), {
    headers: PUBLIC_CACHE_HEADERS,
  });
};
