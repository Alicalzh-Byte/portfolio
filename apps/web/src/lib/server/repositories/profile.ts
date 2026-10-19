/**
 * profile 仓库 —— 个人信息（单行表）。
 *
 * 注意 hidden_fields：不公开的字段名在这里不处理，而是在读取公开接口时由上层过滤，
 * 这样后台读取原始数据与前台过滤共用同一条记录，不需要两份数据。
 */
import type { Profile, SocialLink } from '@portfolio/shared/types';
import type { ProfileUpdateInput } from '@portfolio/shared/schemas';
import { executeBatch, type getDb, nowUtc, queryOne } from '../db';
import { parseJsonArray, stringifyJson } from '../json';
import { buildBumpContentVersionStatement } from './settings';

type ProfileRow = {
  id: number;
  display_name: string;
  headline: string | null;
  about_md: string | null;
  avatar_key: string | null;
  location: string | null;
  status: string | null;
  email: string | null;
  resume_key: string | null;
  social_links: string | null;
  hidden_fields: string | null;
  updated_at: string;
};

/** 显式列出字段，不用 SELECT *（AGENTS.md §4.1）。 */
const PROFILE_COLUMNS = `id, display_name, headline, about_md, avatar_key, location, status,
                         email, resume_key, social_links, hidden_fields, updated_at`;

function mapRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    headline: row.headline,
    aboutMd: row.about_md,
    avatarKey: row.avatar_key,
    location: row.location,
    status: row.status,
    email: row.email,
    resumeKey: row.resume_key,
    socialLinks: parseJsonArray<SocialLink>(row.social_links),
    hiddenFields: parseJsonArray<string>(row.hidden_fields),
    updatedAt: row.updated_at,
  };
}

/** 读取个人信息。未初始化时返回 null，页面据此渲染空状态而不是报错。 */
export async function getProfile(db: ReturnType<typeof getDb>): Promise<Profile | null> {
  const row = await queryOne<ProfileRow>(db, `SELECT ${PROFILE_COLUMNS} FROM profile WHERE id = 1`);
  return row ? mapRow(row) : null;
}

/**
 * 保存个人信息。
 * 与「自增 content_version」放进同一个 batch：D1 的 batch 在单事务内执行，
 * 保证内容更新与缓存失效同时发生。
 */
export async function updateProfile(
  db: ReturnType<typeof getDb>,
  input: ProfileUpdateInput,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法保存个人信息');

  const now = nowUtc();

  await executeBatch(db, [
    {
      sql: `INSERT INTO profile (id, display_name, headline, about_md, avatar_key, location,
                                 status, email, resume_key, social_links, hidden_fields, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              display_name  = excluded.display_name,
              headline      = excluded.headline,
              about_md      = excluded.about_md,
              avatar_key    = excluded.avatar_key,
              location      = excluded.location,
              status        = excluded.status,
              email         = excluded.email,
              resume_key    = excluded.resume_key,
              social_links  = excluded.social_links,
              hidden_fields = excluded.hidden_fields,
              updated_at    = excluded.updated_at`,
      parameters: [
        input.displayName,
        input.headline ?? null,
        input.aboutMd ?? null,
        input.avatarKey ?? null,
        input.location ?? null,
        input.status ?? null,
        input.email ?? null,
        input.resumeKey ?? null,
        stringifyJson(input.socialLinks),
        stringifyJson(input.hiddenFields),
        now,
      ],
    },
    buildBumpContentVersionStatement(),
  ]);
}
