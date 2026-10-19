/**
 * messages 仓库 —— 留言（F6）。
 *
 * 隐私约束：只存 IP 的哈希，不存明文 IP（PRD §4 F6）；哈希用于频率限制。
 */
import type { Message, MessageStatus } from '@portfolio/shared/types';
import { execute, executeBatch, type getDb, nowUtc, queryMany, queryOne } from '../db';

type MessageRow = {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
};

/** 返回给后台的字段不含 ip_hash：后台不需要看到它。 */
const MESSAGE_COLUMNS = 'id, name, email, subject, body, status, created_at';

function mapRow(row: MessageRow): Message {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    body: row.body,
    status: row.status as MessageStatus,
    createdAt: row.created_at,
  };
}

/**
 * 用 Web Crypto 计算 IP 哈希（Workers 与 Node 都提供 globalThis.crypto）。
 * 加盐值来自环境变量，避免被用彩虹表反查还原成 IP。
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export type MessageInput = {
  name: string;
  email: string;
  subject: string | null;
  body: string;
  ipHash: string | null;
  status?: MessageStatus;
};

export async function createMessage(db: ReturnType<typeof getDb>, input: MessageInput): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法保存留言');

  const result = await execute(
    db,
    `INSERT INTO messages (name, email, subject, body, status, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.email,
      input.subject,
      input.body,
      input.status ?? 'new',
      input.ipHash,
      nowUtc(),
    ],
  );

  const id = result.meta?.last_row_id;
  if (typeof id !== 'number') throw new Error('留言写入失败');
  return id;
}

/**
 * 统计某 IP 哈希在时间窗口内的提交次数，用于简单频率限制。
 * 窗口用 SQLite 的 datetime 计算，与 created_at 的 UTC 格式一致。
 */
export async function countRecentMessagesByIp(
  db: ReturnType<typeof getDb>,
  ipHash: string,
  windowMinutes = 10,
): Promise<number> {
  const row = await queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM messages
      WHERE ip_hash = ?
        AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`,
    [ipHash, `-${windowMinutes} minutes`],
  );
  return row?.total ?? 0;
}

export async function listMessages(
  db: ReturnType<typeof getDb>,
  query: { limit: number; offset: number; status?: MessageStatus | 'all' },
): Promise<Message[]> {
  const status = query.status ?? 'all';
  const clause = status === 'all' ? '' : 'WHERE status = ?';
  const parameters: unknown[] = status === 'all' ? [] : [status];

  const rows = await queryMany<MessageRow>(
    db,
    `SELECT ${MESSAGE_COLUMNS} FROM messages ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...parameters, query.limit, query.offset],
  );

  return rows.map(mapRow);
}

export async function countMessages(db: ReturnType<typeof getDb>): Promise<number> {
  const row = await queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM messages');
  return row?.total ?? 0;
}

/** 更新留言状态。留言不属于站点内容，因此**不**自增 content_version。 */
export async function updateMessageStatus(
  db: ReturnType<typeof getDb>,
  id: number,
  status: MessageStatus,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法更新留言');
  await execute(db, 'UPDATE messages SET status = ? WHERE id = ?', [status, id]);
}

export async function deleteMessage(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除留言');
  await execute(db, 'DELETE FROM messages WHERE id = ?', [id]);
}

/** 后台概览用的计数（未处理留言数）。 */
export async function countNewMessages(db: ReturnType<typeof getDb>): Promise<number> {
  const row = await queryOne<{ total: number }>(
    db,
    "SELECT COUNT(*) AS total FROM messages WHERE status = 'new'",
  );
  return row?.total ?? 0;
}

/** 导出备份用：全量留言。 */
export async function exportAllMessages(db: ReturnType<typeof getDb>): Promise<Message[]> {
  return listMessages(db, { limit: 10_000, offset: 0 });
}

/** 让「导出」也能带上留言的全量（含 ip_hash，仅用于备份，不对外展示）。 */
export async function exportMessagesWithHash(db: ReturnType<typeof getDb>): Promise<Record<string, unknown>[]> {
  return queryMany<Record<string, unknown>>(
    db,
    'SELECT id, name, email, subject, body, status, ip_hash, created_at FROM messages ORDER BY created_at DESC',
  );
}

/** 清理垃圾留言（后台批量操作）。 */
export async function purgeSpamMessages(db: ReturnType<typeof getDb>): Promise<void> {
  if (!db) return;
  await executeBatch(db, [{ sql: "DELETE FROM messages WHERE status = 'spam'", parameters: [] }]);
}
