/**
 * 留言管理接口（F6）。
 *
 * 只读列表：支持 `?status=new|handled|spam|all` 过滤。返回体不含 ip_hash（repository 的字段列表已剔除），
 * 后台不需要看到它。留言不属于站点内容，写操作**不**自增 content_version。
 */
import type { APIRoute } from 'astro';
import type { MessageStatus } from '@portfolio/shared/types';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery } from '@portfolio/shared/query';
import { getDb } from '../../../lib/server/db';
import {
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import { listMessages } from '../../../lib/server/repositories/messages';
import { requireAdmin } from './_shared';

/** 把查询参数收敛成合法状态值；非法值按 all 处理。 */
function toStatusFilter(raw: string | null): MessageStatus | 'all' {
  return raw === 'new' || raw === 'handled' || raw === 'spam' ? raw : 'all';
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const { pageSize, offset } = parsePageQuery(url.searchParams);
    const status = toStatusFilter(url.searchParams.get('status'));
    const items = await listMessages(getDb(), { limit: pageSize, offset, status });

    // 按状态过滤时没有对应的计数函数，因此不返回 total 元信息（meta 可选）
    return jsonResponse(ok({ items }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
