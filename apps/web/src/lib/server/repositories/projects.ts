/**
 * projects 仓库 —— 项目读写。
 *
 * 排序规则（PRD F3）：手动排序值优先，其次按时间倒序。
 * 归档项目仍在列表页可见，但不得进入首页精选（AC3.4）。
 */
import type { Project, ProjectStatus, ProjectSummary } from '@portfolio/shared/types';
import type { ProjectInput } from '@portfolio/shared/schemas';
import { execute, executeBatch, type getDb, nowUtc, queryMany, queryOne } from '../db';
import { toBoolean, toSqliteBoolean } from '../json';
import { loadTagsForEntities, replaceEntityTags } from './tags';
import { buildBumpContentVersionStatement } from './settings';

type ProjectRow = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content_md: string | null;
  cover_key: string | null;
  repo_url: string | null;
  demo_url: string | null;
  status: string;
  featured: number;
  sort_order: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

const PROJECT_LIST_COLUMNS = `id, slug, title, summary, cover_key, repo_url, demo_url, status,
                               featured, sort_order, started_at, ended_at, created_at, updated_at`;

const PROJECT_DETAIL_COLUMNS = `${PROJECT_LIST_COLUMNS}, content_md`;

/** 手动排序优先，其次时间倒序（PRD F3 排序规则）。 */
const PROJECT_ORDER = 'ORDER BY sort_order ASC, COALESCE(started_at, created_at) DESC, id DESC';

function mapSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverKey: row.cover_key,
    repoUrl: row.repo_url,
    demoUrl: row.demo_url,
    status: row.status as ProjectStatus,
    featured: toBoolean(row.featured),
    sortOrder: row.sort_order,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: [],
  };
}

function mapDetail(row: ProjectRow): Project {
  return { ...mapSummary(row), contentMd: row.content_md };
}

async function attachTags(
  db: ReturnType<typeof getDb>,
  projects: ProjectSummary[],
): Promise<ProjectSummary[]> {
  if (projects.length === 0) return projects;
  const tagMap = await loadTagsForEntities(db, 'project', projects.map((project) => project.id));
  return projects.map((project) => ({ ...project, tags: tagMap.get(project.id) ?? [] }));
}

export type ProjectQuery = {
  limit: number;
  offset: number;
  tagSlugs?: string[];
  /** 首页只取 featured（AC3.1：取消标记后立刻从首页消失） */
  featuredOnly?: boolean;
};

export async function listProjects(
  db: ReturnType<typeof getDb>,
  query: ProjectQuery,
): Promise<ProjectSummary[]> {
  const tagSlugs = query.tagSlugs ?? [];
  const tagClause =
    tagSlugs.length === 0
      ? ''
      : `AND p.id IN (
           SELECT prt.project_id FROM project_tags prt
             JOIN tags t ON t.id = prt.tag_id
            WHERE t.slug IN (${tagSlugs.map(() => '?').join(', ')})
         )`;
  const featuredClause = query.featuredOnly ? 'AND p.featured = 1' : '';

  const rows = await queryMany<ProjectRow>(
    db,
    `SELECT ${PROJECT_LIST_COLUMNS.split(',')
      .map((column) => `p.${column.trim()}`)
      .join(', ')}
       FROM projects p
      WHERE 1 = 1 ${featuredClause} ${tagClause}
      ${PROJECT_ORDER}
      LIMIT ? OFFSET ?`,
    [...tagSlugs, query.limit, query.offset],
  );

  return attachTags(db, rows.map(mapSummary));
}

export async function countProjects(
  db: ReturnType<typeof getDb>,
  tagSlugs: string[] = [],
): Promise<number> {
  const tagClause =
    tagSlugs.length === 0
      ? ''
      : `AND p.id IN (
           SELECT prt.project_id FROM project_tags prt
             JOIN tags t ON t.id = prt.tag_id
            WHERE t.slug IN (${tagSlugs.map(() => '?').join(', ')})
         )`;

  const row = await queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM projects p WHERE 1 = 1 ${tagClause}`,
    tagSlugs,
  );
  return row?.total ?? 0;
}

export async function getProjectBySlug(
  db: ReturnType<typeof getDb>,
  slug: string,
): Promise<Project | null> {
  const row = await queryOne<ProjectRow>(
    db,
    `SELECT ${PROJECT_DETAIL_COLUMNS} FROM projects WHERE slug = ? LIMIT 1`,
    [slug],
  );
  if (!row) return null;

  const [withTags] = await attachTags(db, [mapSummary(row)]);
  return { ...mapDetail(row), tags: withTags?.tags ?? [] };
}

/** 详情页的「上一个 / 下一个」导航。 */
export async function getAdjacentProjects(
  db: ReturnType<typeof getDb>,
  current: { id: number; sortOrder: number },
): Promise<{ previous: ProjectSummary | null; next: ProjectSummary | null }> {
  const previousRow = await queryOne<ProjectRow>(
    db,
    `SELECT ${PROJECT_LIST_COLUMNS} FROM projects
      WHERE sort_order < ? OR (sort_order = ? AND id < ?)
      ${PROJECT_ORDER} LIMIT 1`,
    [current.sortOrder, current.sortOrder, current.id],
  );

  const nextRow = await queryOne<ProjectRow>(
    db,
    `SELECT ${PROJECT_LIST_COLUMNS} FROM projects
      WHERE sort_order > ? OR (sort_order = ? AND id > ?)
      ORDER BY sort_order ASC, id ASC LIMIT 1`,
    [current.sortOrder, current.sortOrder, current.id],
  );

  return {
    previous: previousRow ? mapSummary(previousRow) : null,
    next: nextRow ? mapSummary(nextRow) : null,
  };
}

export async function listProjectSlugs(db: ReturnType<typeof getDb>): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = await queryMany<{ slug: string; updated_at: string }>(
    db,
    'SELECT slug, updated_at FROM projects ORDER BY sort_order ASC',
  );
  return rows.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

/** 新建项目。 */
export async function createProject(db: ReturnType<typeof getDb>, input: ProjectInput): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法新建项目');

  const now = nowUtc();
  const result = await execute(
    db,
    `INSERT INTO projects (slug, title, summary, content_md, cover_key, repo_url, demo_url, status,
                           featured, sort_order, started_at, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.slug,
      input.title,
      input.summary ?? null,
      input.contentMd ?? null,
      input.coverKey ?? null,
      input.repoUrl ?? null,
      input.demoUrl ?? null,
      input.status,
      toSqliteBoolean(input.featured),
      input.sortOrder,
      input.startedAt ?? null,
      input.endedAt ?? null,
      now,
      now,
    ],
  );

  const projectId = result.meta?.last_row_id;
  if (typeof projectId !== 'number') throw new Error('项目写入失败：未取得自增 id');

  await replaceEntityTags(db, 'project', projectId, input.tagNames);
  await executeBatch(db, [buildBumpContentVersionStatement()]);

  return projectId;
}

export async function updateProject(
  db: ReturnType<typeof getDb>,
  id: number,
  input: ProjectInput,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法更新项目');

  await execute(
    db,
    `UPDATE projects
        SET slug = ?, title = ?, summary = ?, content_md = ?, cover_key = ?, repo_url = ?,
            demo_url = ?, status = ?, featured = ?, sort_order = ?, started_at = ?, ended_at = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      input.slug,
      input.title,
      input.summary ?? null,
      input.contentMd ?? null,
      input.coverKey ?? null,
      input.repoUrl ?? null,
      input.demoUrl ?? null,
      input.status,
      toSqliteBoolean(input.featured),
      input.sortOrder,
      input.startedAt ?? null,
      input.endedAt ?? null,
      nowUtc(),
      id,
    ],
  );

  await replaceEntityTags(db, 'project', id, input.tagNames);
  await executeBatch(db, [buildBumpContentVersionStatement()]);
}

export async function deleteProject(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除项目');
  await executeBatch(db, [
    { sql: 'DELETE FROM projects WHERE id = ?', parameters: [id] },
    buildBumpContentVersionStatement(),
  ]);
}
