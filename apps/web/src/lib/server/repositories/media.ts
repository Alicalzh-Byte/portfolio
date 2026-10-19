/**
 * media 仓库 —— 已上传图片的索引（文件本体在 R2）。
 *
 * 写入顺序固定：**先写 R2，再写 media 表**；写库失败要回滚已上传对象（AGENTS.md §4.3）。
 * 这个顺序由调用方（functions/admin/media.ts）保证，本文件只负责表的读写与引用扫描。
 */
import type { Media, MediaUsage } from '@portfolio/shared/types';
import { execute, type getDb, nowUtc, queryMany, queryOne } from '../db';

type MediaRow = {
  id: number;
  key: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  original_name: string | null;
  created_at: string;
};

type UsageRow = { entity_type: string; entity_id: number; title: string };

const MEDIA_COLUMNS = 'id, key, mime, size_bytes, width, height, original_name, created_at';

function mapRow(row: MediaRow): Media {
  return {
    id: row.id,
    key: row.key,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    originalName: row.original_name,
    createdAt: row.created_at,
  };
}

export async function listMedia(
  db: ReturnType<typeof getDb>,
  query: { limit: number; offset: number },
): Promise<Media[]> {
  const rows = await queryMany<MediaRow>(
    db,
    `SELECT ${MEDIA_COLUMNS} FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [query.limit, query.offset],
  );
  return rows.map(mapRow);
}

export async function countMedia(db: ReturnType<typeof getDb>): Promise<number> {
  const row = await queryOne<{ total: number }>(db, 'SELECT COUNT(*) AS total FROM media');
  return row?.total ?? 0;
}

export async function getMediaByKey(db: ReturnType<typeof getDb>, key: string): Promise<Media | null> {
  const row = await queryOne<MediaRow>(db, `SELECT ${MEDIA_COLUMNS} FROM media WHERE key = ?`, [key]);
  return row ? mapRow(row) : null;
}

export async function createMediaRecord(
  db: ReturnType<typeof getDb>,
  record: { key: string; mime: string; sizeBytes: number; width: number | null; height: number | null; originalName: string | null },
): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法登记图片');

  const result = await execute(
    db,
    `INSERT INTO media (key, mime, size_bytes, width, height, original_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      record.key,
      record.mime,
      record.sizeBytes,
      record.width,
      record.height,
      record.originalName,
      nowUtc(),
    ],
  );

  const id = result.meta?.last_row_id;
  if (typeof id !== 'number') throw new Error('图片登记失败');
  return id;
}

export async function deleteMediaRecord(db: ReturnType<typeof getDb>, key: string): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除图片记录');
  await execute(db, 'DELETE FROM media WHERE key = ?', [key]);
}

/**
 * 扫描引用：图片被哪些内容引用了。
 *
 * media 与内容表之间是弱引用（只存 R2 key，不做外键），所以只能靠反向扫描回答
 * 「删这张图会影响谁」（PRD AC5.5）。扫描范围是显式列出的几个 key 字段。
 */
export async function findMediaUsage(db: ReturnType<typeof getDb>, key: string): Promise<MediaUsage> {
  const rows = await queryMany<UsageRow>(
    db,
    `SELECT 'profile' AS entity_type, 1 AS entity_id, display_name AS title
       FROM profile
      WHERE avatar_key = ? OR resume_key = ?
      UNION ALL
     SELECT 'project' AS entity_type, id AS entity_id, title
       FROM projects
      WHERE cover_key = ?
      UNION ALL
     SELECT 'post' AS entity_type, id AS entity_id, title
       FROM posts
      WHERE cover_key = ?`,
    [key, key, key, key],
  );

  return {
    key,
    usedBy: rows.map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
    })),
  };
}

/** 导出备份用：全量图片索引。 */
export async function exportAllMedia(db: ReturnType<typeof getDb>): Promise<Media[]> {
  return listMedia(db, { limit: 10_000, offset: 0 });
}
