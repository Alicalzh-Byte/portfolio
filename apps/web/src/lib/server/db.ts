/**
 * D1 客户端与查询执行（服务端专用）。
 *
 * 这一层只做「拿到绑定 + 执行/整理结果」，业务查询写在 repositories/。
 * 严禁前端组件 import 本模块（AGENTS.md §3）。
 */
import { env } from 'cloudflare:workers';
import type { D1Database, D1Result } from '@cloudflare/workers-types';

/**
 * 取出 D1 绑定。
 *
 * 返回 null 而**不是抛错**是刻意的：测试环境与未绑定 D1 的运行方式下拿不到 DB，
 * 此时页面应渲染空状态而不是整站 500。调用方必须处理 null。
 */
export function getDb(): D1Database | null {
  return env?.DB ?? null;
}

/** 取一条记录；D1 的 first() 返回 unknown，统一用泛型收窄。 */
export async function queryOne<T>(
  db: D1Database | null,
  sql: string,
  parameters: unknown[] = [],
): Promise<T | null> {
  if (!db) return null;
  const statement = db.prepare(sql).bind(...parameters);
  const row = await statement.first<T>();
  return row ?? null;
}

/** 取多条记录。列表接口统一返回 `{ items: [] }`，所以这里也把 null 收敛成空数组。 */
export async function queryMany<T>(
  db: D1Database | null,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  if (!db) return [];
  const result = await db.prepare(sql).bind(...parameters).all<T>();
  return result.results ?? [];
}

/** 执行写入（INSERT / UPDATE / DELETE），返回影响行数与自增 id。 */
export async function execute(
  db: D1Database,
  sql: string,
  parameters: unknown[] = [],
): Promise<D1Result> {
  return db.prepare(sql).bind(...parameters).run();
}

/**
 * 批量执行：D1 的 batch() 在单个事务里跑完所有语句，
 * 用于「写入内容 + 自增 content_version」这类必须同时成立的组合操作。
 */
export async function executeBatch(
  db: D1Database,
  statements: { sql: string; parameters?: unknown[] }[],
): Promise<D1Result[]> {
  const prepared = statements.map((item) => db.prepare(item.sql).bind(...(item.parameters ?? [])));
  return db.batch(prepared);
}

/** 当前 UTC 时间，格式与迁移里的 strftime('%Y-%m-%dT%H:%M:%SZ') 保持一致。 */
export function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
