/**
 * 文章详情接口（公开只读）。
 * 草稿在数据层返回 null → 这里返回 404，草稿永远不会从公开接口泄漏。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { renderMarkdown, extractHeadings } from '@portfolio/shared/markdown';
import { loadPostDetail } from '../../../lib/server/content';
import { errorResponse, jsonResponse, PUBLIC_CACHE_HEADERS } from '../../../lib/server/http';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return errorResponse('NOT_FOUND', '缺少文章标识。', { status: 404 });

  const detail = await loadPostDetail(slug);
  if (!detail) return errorResponse('NOT_FOUND', '文章不存在或尚未发布。', { status: 404 });

  const [html] = await Promise.all([renderMarkdown(detail.post.contentMd)]);

  return jsonResponse(
    ok({
      post: { ...detail.post, contentMd: undefined },
      html,
      toc: extractHeadings(detail.post.contentMd),
      related: detail.related,
    }),
    { headers: PUBLIC_CACHE_HEADERS },
  );
};
