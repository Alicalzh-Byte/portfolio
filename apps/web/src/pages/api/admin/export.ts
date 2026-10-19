/**
 * 全量 JSON 备份导出（对应 PRD 的备份与迁移要求，TECH_DESIGN §3.5）。
 *
 * 重建路径是「建库 → 迁移 → 导入」，因此导出必须包含**全部内容**（含草稿）与图片/留言索引，
 * 这样才不锁定在 D1 上。消息走 exportMessagesWithHash：备份需要 ip_hash 用于频率限制的还原，
 * 但它只在受保护的后台接口出现，不会进入任何公开出口。
 */
import type { APIRoute } from 'astro';
import type { Post, Project } from '@portfolio/shared/types';
import { ok } from '@portfolio/shared/api';
import { getDb, nowUtc } from '../../../lib/server/db';
import { internalErrorResponse, jsonResponse, NO_STORE_HEADERS } from '../../../lib/server/http';
import { exportAllMedia } from '../../../lib/server/repositories/media';
import { exportMessagesWithHash } from '../../../lib/server/repositories/messages';
import { getPostById, listPostsForAdmin } from '../../../lib/server/repositories/posts';
import { getProfile } from '../../../lib/server/repositories/profile';
import { getProjectBySlug, listProjectSlugs } from '../../../lib/server/repositories/projects';
import { getSettings } from '../../../lib/server/repositories/settings';
import { listSkillGroups } from '../../../lib/server/repositories/skills';
import { listTags } from '../../../lib/server/repositories/tags';
import { listTimelineItems } from '../../../lib/server/repositories/timeline';
import { requireAdmin } from './_shared';

/** 备份时的取数上限：个人站远小于此，一次性取回避免分页遗漏。 */
const BACKUP_LIMIT = 10_000;

/** 备份对象的结构版本：未来若调整备份形状，导入脚本据此做兼容。 */
const BACKUP_SCHEMA_VERSION = 1;

/**
 * 取全部项目（含正文）。
 * projects 仓库没有「列表即含正文」的函数，只能先取 slug 再逐个取详情 —— 备份是低频后台操作，可接受。
 */
async function loadAllProjects(db: ReturnType<typeof getDb>): Promise<Project[]> {
  const slugs = await listProjectSlugs(db);
  const projects = await Promise.all(slugs.map((entry) => getProjectBySlug(db, entry.slug)));
  return projects.filter((project): project is Project => project !== null);
}

/** 取全部文章（含草稿与正文）：先取后台列表拿到 id，再逐个取详情。 */
async function loadAllPosts(db: ReturnType<typeof getDb>): Promise<Post[]> {
  const summaries = await listPostsForAdmin(db, { limit: BACKUP_LIMIT, offset: 0, status: 'all' });
  const posts = await Promise.all(summaries.map((summary) => getPostById(db, summary.id)));
  return posts.filter((post): post is Post => post !== null);
}

export const GET: APIRoute = async ({ locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const db = getDb();
    if (!db) return internalErrorResponse();

    const [profile, settings, skillGroups, projects, posts, tags, timeline, media, messages] =
      await Promise.all([
        getProfile(db),
        getSettings(db),
        listSkillGroups(db, false),
        loadAllProjects(db),
        loadAllPosts(db),
        listTags(db),
        listTimelineItems(db),
        exportAllMedia(db),
        exportMessagesWithHash(db),
      ]);

    return jsonResponse(
      ok({
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: nowUtc(),
        contentVersion: settings.contentVersion,
        profile,
        settings,
        skillGroups,
        projects,
        posts,
        tags,
        timeline,
        media,
        messages,
      }),
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return internalErrorResponse();
  }
};
