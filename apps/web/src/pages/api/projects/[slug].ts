/** 项目详情接口（公开只读）。不存在时返回 404 统一信封。 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { renderMarkdown } from '@portfolio/shared/markdown';
import { loadProjectDetail } from '../../../lib/server/content';
import { errorResponse, jsonResponse, PUBLIC_CACHE_HEADERS } from '../../../lib/server/http';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return errorResponse('NOT_FOUND', '缺少项目标识。', { status: 404 });

  const detail = await loadProjectDetail(slug);
  if (!detail) return errorResponse('NOT_FOUND', '项目不存在。', { status: 404 });

  const html = detail.project.contentMd ? await renderMarkdown(detail.project.contentMd) : '';

  return jsonResponse(
    ok({
      project: { ...detail.project, contentMd: undefined },
      html,
      adjacent: detail.adjacent,
    }),
    { headers: PUBLIC_CACHE_HEADERS },
  );
};
