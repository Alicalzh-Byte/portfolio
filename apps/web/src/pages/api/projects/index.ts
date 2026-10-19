/** 项目列表接口（公开只读，PRD F3）。支持标签筛选与分页。 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery, parseTagParams, totalPages } from '@portfolio/shared/query';
import { loadProjectList } from '../../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../../lib/server/http';

export const GET: APIRoute = async ({ url }) => {
  const { page, pageSize } = parsePageQuery(url.searchParams);
  const tagSlugs = parseTagParams(url.searchParams);

  const { items, total } = await loadProjectList({ page, pageSize, tagSlugs });

  return jsonResponse(ok({ items }, { page, pageSize, total, totalPages: totalPages(total, pageSize) }), {
    headers: PUBLIC_CACHE_HEADERS,
  });
};
