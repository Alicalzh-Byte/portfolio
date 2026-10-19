/**
 * tags 仓库 —— 文章与项目共用同一张标签表（TECH_DESIGN §3.1 原则 3）。
 *
 * 这里同时提供「按实体批量取标签」的能力：列表页若逐条查标签会退化成 N+1 查询，
 * 而 D1 每次查询都有网络往返，必须避免。
 */
import type { Tag, TagWithCount } from '@portfolio/shared/types';
import { execute, executeBatch, type getDb, queryMany } from '../db';
import { toSlug } from '@portfolio/shared/query';

type TagRow = { id: number; name: string; slug: string };
type TagCountRow = { id: number; name: string; slug: string; post_count: number; project_count: number };

const TAG_COLUMNS = 'id, name, slug';

function mapRow(row: TagRow): Tag {
  return { id: row.id, name: row.name, slug: row.slug };
}

/** 全部标签（后台的标签选择器与站点地图用）。 */
export async function listTags(db: ReturnType<typeof getDb>): Promise<Tag[]> {
  const rows = await queryMany<TagRow>(db, `SELECT ${TAG_COLUMNS} FROM tags ORDER BY name ASC`);
  return rows.map(mapRow);
}

/**
 * 带内容数量的标签列表（标签聚合页、筛选器）。
 * 只统计**已发布**文章：草稿数量绝不能出现在公开出口（AGENTS.md §4.4）。
 */
export async function listTagsWithCounts(db: ReturnType<typeof getDb>): Promise<TagWithCount[]> {
  const rows = await queryMany<TagCountRow>(
    db,
    `SELECT t.id,
            t.name,
            t.slug,
            (SELECT COUNT(*) FROM post_tags pt
               JOIN posts p ON p.id = pt.post_id
              WHERE pt.tag_id = t.id AND p.status = 'published') AS post_count,
            (SELECT COUNT(*) FROM project_tags prt
               JOIN projects pr ON pr.id = prt.project_id
              WHERE prt.tag_id = t.id) AS project_count
       FROM tags t
      ORDER BY t.name ASC`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    postCount: row.post_count,
    projectCount: row.project_count,
  }));
}

/** 按 slug 取标签（标签聚合页需要一个权威的名字与 slug）。 */
export async function getTagBySlug(db: ReturnType<typeof getDb>, slug: string): Promise<Tag | null> {
  const rows = await queryMany<TagRow>(db, `SELECT ${TAG_COLUMNS} FROM tags WHERE slug = ? LIMIT 1`, [slug]);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

/**
 * 按名称批量取标签 id，不存在则创建。
 * 用 slug 归一化匹配（「TypeScript」与「typescript」视为同一个标签），
 * 避免同一个技术因为大小写差异裂成两个标签。
 */
export async function ensureTagIds(
  db: ReturnType<typeof getDb>,
  names: string[],
): Promise<number[]> {
  if (!db || names.length === 0) return [];

  const normalized = new Map<string, string>();
  for (const name of names) {
    const slug = toSlug(name) || name.trim().toLowerCase();
    if (slug) normalized.set(slug, name.trim());
  }
  if (normalized.size === 0) return [];

  const slugs = [...normalized.keys()];
  const placeholders = slugs.map(() => '?').join(', ');
  const existing = await queryMany<TagRow>(
    db,
    `SELECT ${TAG_COLUMNS} FROM tags WHERE slug IN (${placeholders})`,
    slugs,
  );

  const idBySlug = new Map<string, number>();
  for (const row of existing) idBySlug.set(row.slug, row.id);

  for (const [slug, name] of normalized) {
    if (idBySlug.has(slug)) continue;
    const result = await execute(db, 'INSERT INTO tags (name, slug) VALUES (?, ?)', [name, slug]);
    const insertedId = result.meta?.last_row_id;
    if (typeof insertedId === 'number') idBySlug.set(slug, insertedId);
  }

  return slugs.map((slug) => idBySlug.get(slug)).filter((id): id is number => typeof id === 'number');
}

/**
 * 按实体批量取标签。
 * @param entity 决定用哪张连接表（post_tags / project_tags）
 */
export async function loadTagsForEntities(
  db: ReturnType<typeof getDb>,
  entity: 'post' | 'project',
  entityIds: number[],
): Promise<Map<number, Tag[]>> {
  const grouped = new Map<number, Tag[]>();
  if (!db || entityIds.length === 0) return grouped;

  const table = entity === 'post' ? 'post_tags' : 'project_tags';
  const entityColumn = entity === 'post' ? 'post_id' : 'project_id';
  const placeholders = entityIds.map(() => '?').join(', ');

  const rows = await queryMany<TagRow & { entity_id: number }>(
    db,
    `SELECT link.${entityColumn} AS entity_id, t.id, t.name, t.slug
       FROM ${table} link
       JOIN tags t ON t.id = link.tag_id
      WHERE link.${entityColumn} IN (${placeholders})
      ORDER BY t.name ASC`,
    entityIds,
  );

  for (const row of rows) {
    const bucket = grouped.get(row.entity_id) ?? [];
    bucket.push(mapRow(row));
    grouped.set(row.entity_id, bucket);
  }

  return grouped;
}

/**
 * 重建某实体的标签关联（先清空再写入）。
 * 与自增 content_version 一起放进 batch，保证标签变化也会让缓存失效。
 */
export async function replaceEntityTags(
  db: ReturnType<typeof getDb>,
  entity: 'post' | 'project',
  entityId: number,
  tagNames: string[],
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法保存标签');

  const table = entity === 'post' ? 'post_tags' : 'project_tags';
  const entityColumn = entity === 'post' ? 'post_id' : 'project_id';

  const tagIds = await ensureTagIds(db, tagNames);

  const statements = [{ sql: `DELETE FROM ${table} WHERE ${entityColumn} = ?`, parameters: [entityId] }];
  for (const tagId of tagIds) {
    statements.push({
      sql: `INSERT INTO ${table} (${entityColumn}, tag_id) VALUES (?, ?)`,
      parameters: [entityId, tagId],
    });
  }

  await executeBatch(db, statements);
}
