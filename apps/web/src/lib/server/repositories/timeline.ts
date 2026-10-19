/** timeline_items 仓库 —— 关于页「经历时间线」。 */
import type { TimelineItem } from '@portfolio/shared/types';
import { type getDb, queryMany, queryOne } from '../db';

type TimelineRow = {
  id: number;
  period: string;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const TIMELINE_COLUMNS = 'id, period, title, description, sort_order, created_at, updated_at';

function mapRow(row: TimelineRow): TimelineItem {
  return {
    id: row.id,
    period: row.period,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTimelineItems(db: ReturnType<typeof getDb>): Promise<TimelineItem[]> {
  const rows = await queryMany<TimelineRow>(
    db,
    `SELECT ${TIMELINE_COLUMNS} FROM timeline_items ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapRow);
}

export async function getTimelineItem(
  db: ReturnType<typeof getDb>,
  id: number,
): Promise<TimelineItem | null> {
  const row = await queryOne<TimelineRow>(
    db,
    `SELECT ${TIMELINE_COLUMNS} FROM timeline_items WHERE id = ?`,
    [id],
  );
  return row ? mapRow(row) : null;
}
