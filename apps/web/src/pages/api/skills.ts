/** 技能分组接口（公开只读，PRD F2）。只返回可见项。 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { loadSkillGroups } from '../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../lib/server/http';

export const GET: APIRoute = async () => {
  const items = await loadSkillGroups();
  // 列表一律返回 { items: [] }，空结果也是成功
  return jsonResponse(ok({ items }), { headers: PUBLIC_CACHE_HEADERS });
};
