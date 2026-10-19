/**
 * posts 仓库 —— 文章读写。
 *
 * ⚠️ 草稿过滤必须发生在这一层（AGENTS.md §4.4）：
 * 所有公开读方法都在 SQL 里写死 `status = 'published'`，
 * 不允许「查出来再在前端隐藏」这种伪过滤 —— 那会让草稿出现在 RSS 与 sitemap 里。
 */
import type { ContentStatus, Post, PostSummary } from '@portfolio/shared/types';
import { estimateReadingMinutes } from '@portfolio/shared/markdown';
import type { PostInput } from '@portfolio/shared/schemas';
import { execute, executeBatch, type getDb, nowUtc, queryMany, queryOne } from '../db';
import { loadTagsForEntities, replaceEntityTags } from './tags';
import { buildBumpContentVersionStatement } from './settings';

type PostRow = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content_md: string;
  cover_key: string | null;
  status: string;
  published_at: string | null;
  reading_minutes: number;
  view_count: number;
  created_at: string;
  updated_at: string;
};

/** 列表视图不含 content_md：正文可能上万字，列表页没有理由把它拉回来。 */
const POST_LIST_COLUMNS = `id, slug, title, summary, cover_key, status, published_at,
                            reading_minutes, view_count, created_at, updated_at`;

const POST_DETAIL_COLUMNS = `${POST_LIST_COLUMNS}, content_md`;

function mapSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverKey: row.cover_key,
    status: row.status as ContentStatus,
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: [],
  };
}

function mapDetail(row: PostRow): Post {
  return { ...mapSummary(row), contentMd: row.content_md };
}

/** 把标签挂回实体上（批量，避免 N+1）。 */
async function attachTags(
  db: ReturnType<typeof getDb>,
  posts: PostSummary[],
): Promise<PostSummary[]> {
  if (posts.length === 0) return posts;
  const tagMap = await loadTagsForEntities(db, 'post', posts.map((post) => post.id));
  return posts.map((post) => ({ ...post, tags: tagMap.get(post.id) ?? [] }));
}

/** 构造标签筛选子句。多选按「任一命中」处理（OR），与筛选器的直觉一致。 */
function buildTagFilter(tagSlugs: string[]): { clause: string; parameters: unknown[] } {
  if (tagSlugs.length === 0) return { clause: '', parameters: [] };
  const placeholders = tagSlugs.map(() => '?').join(', ');
  return {
    clause: `AND p.id IN (
                SELECT pt.post_id FROM post_tags pt
                  JOIN tags t ON t.id = pt.tag_id
                 WHERE t.slug IN (${placeholders})
              )`,
    parameters: tagSlugs,
  };
}

export type PublishedPostQuery = {
  limit: number;
  offset: number;
  tagSlugs?: string[];
};

/** 已发布文章列表（前台列表页 / 公开接口）。 */
export async function listPublishedPosts(
  db: ReturnType<typeof getDb>,
  query: PublishedPostQuery,
): Promise<PostSummary[]> {
  const filter = buildTagFilter(query.tagSlugs ?? []);

  const rows = await queryMany<PostRow>(
    db,
    `SELECT ${POST_LIST_COLUMNS.split(',')
      .map((column) => `p.${column.trim()}`)
      .join(', ')}
       FROM posts p
      WHERE p.status = 'published' ${filter.clause}
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT ? OFFSET ?`,
    [...filter.parameters, query.limit, query.offset],
  );

  return attachTags(db, rows.map(mapSummary));
}

/** 已发布文章总数（分页用）。 */
export async function countPublishedPosts(
  db: ReturnType<typeof getDb>,
  tagSlugs: string[] = [],
): Promise<number> {
  const filter = buildTagFilter(tagSlugs);
  const row = await queryOne<{ total: number }>(
    db,
    `SELECT COUNT(*) AS total FROM posts p WHERE p.status = 'published' ${filter.clause}`,
    filter.parameters,
  );
  return row?.total ?? 0;
}

/**
 * 按 slug 取已发布文章。
 * 草稿在这里返回 null —— 于是详情页会走 404 分支，草稿永远不会被公开访问到。
 */
export async function getPublishedPostBySlug(
  db: ReturnType<typeof getDb>,
  slug: string,
): Promise<Post | null> {
  const row = await queryOne<PostRow>(
    db,
    `SELECT ${POST_DETAIL_COLUMNS} FROM posts WHERE slug = ? AND status = 'published' LIMIT 1`,
    [slug],
  );
  if (!row) return null;

  const [withTags] = await attachTags(db, [mapSummary(row)]);
  return { ...mapDetail(row), tags: withTags?.tags ?? [] };
}

/** 相关文章：共享标签的已发布文章（推荐位用）。 */
export async function listRelatedPosts(
  db: ReturnType<typeof getDb>,
  postId: number,
  limit = 3,
): Promise<PostSummary[]> {
  const rows = await queryMany<PostRow>(
    db,
    `SELECT ${POST_LIST_COLUMNS.split(',')
      .map((column) => `p.${column.trim()}`)
      .join(', ')}
       FROM posts p
      WHERE p.status = 'published'
        AND p.id <> ?
        AND p.id IN (
          SELECT rpt.post_id FROM post_tags rpt
           WHERE rpt.tag_id IN (SELECT tag_id FROM post_tags WHERE post_id = ?)
        )
      ORDER BY p.published_at DESC
      LIMIT ?`,
    [postId, postId, limit],
  );

  return attachTags(db, rows.map(mapSummary));
}

/** 站点地图与 RSS 用的已发布文章（含正文，RSS 需要全文输出）。 */
export async function listPublishedPostsForFeed(db: ReturnType<typeof getDb>, limit = 20): Promise<Post[]> {
  const rows = await queryMany<PostRow>(
    db,
    `SELECT ${POST_DETAIL_COLUMNS} FROM posts
      WHERE status = 'published'
      ORDER BY published_at DESC, id DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map(mapDetail);
}

/** 站点地图用：只取 slug 与时间戳，避免把正文全量拉出来。 */
export async function listPublishedPostSlugs(
  db: ReturnType<typeof getDb>,
): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = await queryMany<{ slug: string; updated_at: string }>(
    db,
    `SELECT slug, updated_at FROM posts WHERE status = 'published' ORDER BY published_at DESC`,
  );
  return rows.map((row) => ({ slug: row.slug, updatedAt: row.updated_at }));
}

/* ------------------------------------------------------------------ *
 * 后台读写（会包含草稿）
 * ------------------------------------------------------------------ */

export type AdminPostQuery = {
  limit: number;
  offset: number;
  status?: ContentStatus | 'all';
};

export async function listPostsForAdmin(
  db: ReturnType<typeof getDb>,
  query: AdminPostQuery,
): Promise<PostSummary[]> {
  const status = query.status ?? 'all';
  const statusClause = status === 'all' ? '' : 'WHERE status = ?';
  const parameters: unknown[] = status === 'all' ? [] : [status];

  const rows = await queryMany<PostRow>(
    db,
    `SELECT ${POST_LIST_COLUMNS} FROM posts ${statusClause}
      ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...parameters, query.limit, query.offset],
  );

  return attachTags(db, rows.map(mapSummary));
}

export async function getPostById(db: ReturnType<typeof getDb>, id: number): Promise<Post | null> {
  const row = await queryOne<PostRow>(db, `SELECT ${POST_DETAIL_COLUMNS} FROM posts WHERE id = ?`, [id]);
  if (!row) return null;

  const [withTags] = await attachTags(db, [mapSummary(row)]);
  return { ...mapDetail(row), tags: withTags?.tags ?? [] };
}

/**
 * 新建文章。
 * 阅读时长由正文自动估算（AC4.3），不依赖站主手填。
 */
export async function createPost(db: ReturnType<typeof getDb>, input: PostInput): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法新建文章');

  const now = nowUtc();
  const readingMinutes = estimateReadingMinutes(input.contentMd);
  const publishedAt = input.status === 'published' ? (input.publishedAt ?? now) : null;

  const result = await execute(
    db,
    `INSERT INTO posts (slug, title, summary, content_md, cover_key, status, published_at,
                        reading_minutes, view_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      input.slug,
      input.title,
      input.summary ?? null,
      input.contentMd,
      input.coverKey ?? null,
      input.status,
      publishedAt,
      readingMinutes,
      now,
      now,
    ],
  );

  const postId = result.meta?.last_row_id;
  if (typeof postId !== 'number') throw new Error('文章写入失败：未取得自增 id');

  await replaceEntityTags(db, 'post', postId, input.tagNames);
  await executeBatch(db, [buildBumpContentVersionStatement()]);

  return postId;
}

/**
 * 更新文章。
 * published_at 只在「首次发布」时写入：已发布文章再次编辑不改动它（PRD AC4.1 展示首次发布时间）。
 */
export async function updatePost(
  db: ReturnType<typeof getDb>,
  id: number,
  input: PostInput,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法更新文章');

  const existing = await queryOne<{ status: string; published_at: string | null }>(
    db,
    'SELECT status, published_at FROM posts WHERE id = ?',
    [id],
  );
  if (!existing) throw new Error('文章不存在');

  const now = nowUtc();
  const readingMinutes = estimateReadingMinutes(input.contentMd);
  const publishedAt =
    input.status === 'published' ? (existing.published_at ?? input.publishedAt ?? now) : existing.published_at;

  await execute(
    db,
    `UPDATE posts
        SET slug = ?, title = ?, summary = ?, content_md = ?, cover_key = ?, status = ?,
            published_at = ?, reading_minutes = ?, updated_at = ?
      WHERE id = ?`,
    [
      input.slug,
      input.title,
      input.summary ?? null,
      input.contentMd,
      input.coverKey ?? null,
      input.status,
      publishedAt,
      readingMinutes,
      now,
      id,
    ],
  );

  await replaceEntityTags(db, 'post', id, input.tagNames);
  await executeBatch(db, [buildBumpContentVersionStatement()]);
}

/** 发布（把草稿切成已发布，并补上首次发布时间）。 */
export async function publishPost(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法发布文章');

  const now = nowUtc();
  await executeBatch(db, [
    {
      sql: `UPDATE posts
               SET status = 'published',
                   published_at = COALESCE(published_at, ?),
                   updated_at = ?
             WHERE id = ?`,
      parameters: [now, now, id],
    },
    buildBumpContentVersionStatement(),
  ]);
}

/** 删除文章（调用方需先落一份 content_revisions 快照）。 */
export async function deletePost(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除文章');
  await executeBatch(db, [
    { sql: 'DELETE FROM posts WHERE id = ?', parameters: [id] },
    buildBumpContentVersionStatement(),
  ]);
}

/** 浏览量自增。刻意**不**自增 content_version：浏览数不属于内容，不该让缓存整体失效。 */
export async function incrementPostViewCount(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) return;
  await execute(db, 'UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [id]);
}
