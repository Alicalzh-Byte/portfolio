/**
 * content_revisions 仓库 —— 变更前快照（破坏性操作可回滚）。
 *
 * 约定（AGENTS.md §4.3）：删除文章 / 项目 / 图片前，必须先落一份快照。
 */
import type { ContentRevision, RevisionEntityType } from '@portfolio/shared/types';
import { execute, type getDb, nowUtc, queryMany, queryOne } from '../db';

type RevisionRow = {
  id: number;
  entity_type: string;
  entity_id: number;
  snapshot: string;
  note: string | null;
  created_at: string;
};

const REVISION_COLUMNS = 'id, entity_type, entity_id, snapshot, note, created_at';

function mapRow(row: RevisionRow): ContentRevision {
  return {
    id: row.id,
    entityType: row.entity_type as RevisionEntityType,
    entityId: row.entity_id,
    snapshot: row.snapshot,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * 写入一份快照。
 * 传入的 entity 会被 JSON 序列化；序列化失败会抛错（宁可失败也不要写一份坏快照）。
 */
export async function createRevision(
  db: ReturnType<typeof getDb>,
  entityType: RevisionEntityType,
  entityId: number,
  snapshot: unknown,
  note: string | null = null,
): Promise<void> {
  if (!db) return;

  await execute(
    db,
    `INSERT INTO content_revisions (entity_type, entity_id, snapshot, note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [entityType, entityId, JSON.stringify(snapshot), note, nowUtc()],
  );
}

export async function listRevisions(
  db: ReturnType<typeof getDb>,
  entityType: RevisionEntityType,
  entityId: number,
  limit = 20,
): Promise<ContentRevision[]> {
  const rows = await queryMany<RevisionRow>(
    db,
    `SELECT ${REVISION_COLUMNS} FROM content_revisions
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY created_at DESC LIMIT ?`,
    [entityType, entityId, limit],
  );
  return rows.map(mapRow);
}

export async function getRevision(
  db: ReturnType<typeof getDb>,
  id: number,
): Promise<ContentRevision | null> {
  const row = await queryOne<RevisionRow>(db, `SELECT ${REVISION_COLUMNS} FROM content_revisions WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

/**
 * 清理超出保留窗口的快照。
 * entityId 传 null 表示清理该类型的全部历史，只保留最近 keepCount 条。
 */
export async function pruneRevisions(
  db: ReturnType<typeof getDb>,
  entityType: RevisionEntityType,
  entityId: number,
  keepCount = 10,
): Promise<void> {
  if (!db) return;

  await execute(
    db,
    `DELETE FROM content_revisions
      WHERE entity_type = ? AND entity_id = ?
        AND id NOT IN (
          SELECT id FROM content_revisions
           WHERE entity_type = ? AND entity_id = ?
           ORDER BY created_at DESC LIMIT ?
        )`,
    [entityType, entityId, entityType, entityId, keepCount],
  );
}
