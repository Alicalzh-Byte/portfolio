/**
 * 页面内容门面（服务端专用）。
 *
 * 页面只调用这里的函数，不直接碰 repositories —— 这样「加缓存」只需要改一处，
 * 而且所有读取都自动带上 content_version 缓存键（TECH_DESIGN §4.2）。
 */
import type { Profile, Settings, SkillGroup, TimelineItem } from '@portfolio/shared/types';
import type { PostSummary, ProjectSummary } from '@portfolio/shared/types';
import { buildCacheKey, cached } from './cache';
import { getDb } from './db';
import { getProfile } from './repositories/profile';
import { getSettings } from './repositories/settings';
import { listSkillGroups } from './repositories/skills';
import { listTimelineItems } from './repositories/timeline';
import { countPublishedPosts, listPublishedPosts, listRelatedPosts, getPublishedPostBySlug } from './repositories/posts';
import { countProjects, getAdjacentProjects, getProjectBySlug, listProjects } from './repositories/projects';
import { listTagsWithCounts, getTagBySlug } from './repositories/tags';
import type { Tag, TagWithCount } from '@portfolio/shared/types';

/** 站点级上下文（布局层需要）：设置 + 个人信息。 */
export type SiteContext = {
  settings: Settings | null;
  profile: Profile | null;
};

export async function loadSiteContext(): Promise<SiteContext> {
  const db = getDb();
  const [settings, profile] = await Promise.all([getSettings(db), getProfile(db)]);
  return { settings, profile };
}

/** 首页 / 关于页的个人信息。 */
export async function loadProfile(): Promise<Profile | null> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('profile', settings.contentVersion), () => getProfile(db));
}

/** 技能分组（只取可见项）。 */
export async function loadSkillGroups(): Promise<SkillGroup[]> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('skills', settings.contentVersion), () => listSkillGroups(db, true));
}

/** 经历时间线。 */
export async function loadTimeline(): Promise<TimelineItem[]> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('timeline', settings.contentVersion), () => listTimelineItems(db));
}

/** 所有标签及其内容数量。 */
export async function loadTags(): Promise<TagWithCount[]> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('tags', settings.contentVersion), () => listTagsWithCounts(db));
}

/** 按 slug 取标签。 */
export async function loadTag(slug: string): Promise<Tag | null> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('tag', settings.contentVersion, { slug }), () => getTagBySlug(db, slug));
}

/** 精选项目（首页，最多 6 个 — PRD F3）。 */
export async function loadFeaturedProjects(): Promise<ProjectSummary[]> {
  const db = getDb();
  const settings = await getSettings(db);
  return cached(buildCacheKey('projects', settings.contentVersion, { featured: 1, limit: 6 }), () =>
    listProjects(db, { limit: 6, offset: 0, featuredOnly: true }),
  );
}

export type ProjectListResult = {
  items: ProjectSummary[];
  total: number;
};

/** 项目列表（支持标签筛选与分页）。 */
export async function loadProjectList(
  options: { page: number; pageSize: number; tagSlugs: string[] },
): Promise<ProjectListResult> {
  const db = getDb();
  const settings = await getSettings(db);
  const offset = (options.page - 1) * options.pageSize;
  const cacheKey = buildCacheKey('projects', settings.contentVersion, {
    tags: options.tagSlugs.join(',') || '-',
    page: options.page,
    pageSize: options.pageSize,
  });

  const [items, total] = await cached(cacheKey, async () => {
    const [rows, count] = await Promise.all([
      listProjects(db, {
        limit: options.pageSize,
        offset,
        tagSlugs: options.tagSlugs,
      }),
      countProjects(db, options.tagSlugs),
    ]);
    return [rows, count] as [ProjectSummary[], number];
  });

  return { items, total };
}

/** 项目详情 + 相邻项目。 */
export async function loadProjectDetail(slug: string) {
  const db = getDb();
  const settings = await getSettings(db);

  return cached(buildCacheKey('project', settings.contentVersion, { slug }), async () => {
    const project = await getProjectBySlug(db, slug);
    if (!project) return null;

    const adjacent = await getAdjacentProjects(db, { id: project.id, sortOrder: project.sortOrder });
    return { project, adjacent };
  });
}

export type PostListResult = {
  items: PostSummary[];
  total: number;
};

/** 文章列表（只含已发布；支持标签筛选与分页）。 */
export async function loadPostList(
  options: { page: number; pageSize: number; tagSlugs: string[] },
): Promise<PostListResult> {
  const db = getDb();
  const settings = await getSettings(db);
  const offset = (options.page - 1) * options.pageSize;
  const cacheKey = buildCacheKey('posts', settings.contentVersion, {
    tags: options.tagSlugs.join(',') || '-',
    page: options.page,
    pageSize: options.pageSize,
  });

  const [items, total] = await cached(cacheKey, async () => {
    const [rows, count] = await Promise.all([
      listPublishedPosts(db, { limit: options.pageSize, offset, tagSlugs: options.tagSlugs }),
      countPublishedPosts(db, options.tagSlugs),
    ]);
    return [rows, count] as [PostSummary[], number];
  });

  return { items, total };
}

/** 文章详情 + 相关文章。草稿在此返回 null（详情页据此走 404）。 */
export async function loadPostDetail(slug: string) {
  const db = getDb();
  const settings = await getSettings(db);

  return cached(buildCacheKey('post', settings.contentVersion, { slug }), async () => {
    const post = await getPublishedPostBySlug(db, slug);
    if (!post) return null;

    const related = await listRelatedPosts(db, post.id, 3);
    return { post, related };
  });
}
