/**
 * 站点设置（公开只读接口，PRD F5）。
 * 只返回可公开的字段；任何密钥都不在这里面。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { loadSiteContext } from '../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../lib/server/http';

export const GET: APIRoute = async () => {
  const { settings } = await loadSiteContext();

  // settings 为 null 表示 D1 未接上；仍返回成功信封 + 空对象，
  // 而不是 404 —— 空结果也是成功（AGENTS.md §4.1 容器语义）。
  return jsonResponse(ok(settings ?? {}), { headers: PUBLIC_CACHE_HEADERS });
};
