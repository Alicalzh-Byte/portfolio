/**
 * 个人信息接口（公开只读，PRD F1）。
 * hidden_fields 中列出的字段在此处被剔除 —— 过滤发生在服务端，前端拿不到隐藏字段（AC1.2）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { loadSiteContext } from '../../lib/server/content';
import { jsonResponse, PUBLIC_CACHE_HEADERS } from '../../lib/server/http';

export const GET: APIRoute = async () => {
  const { profile } = await loadSiteContext();

  if (!profile) return jsonResponse(ok(null), { headers: PUBLIC_CACHE_HEADERS });

  const hidden = new Set(profile.hiddenFields);
  const publicProfile = {
    displayName: profile.displayName,
    headline: profile.headline,
    aboutMd: profile.aboutMd,
    avatarKey: profile.avatarKey,
    location: hidden.has('location') ? null : profile.location,
    status: hidden.has('status') ? null : profile.status,
    email: hidden.has('email') ? null : profile.email,
    resumeKey: profile.resumeKey,
    socialLinks: profile.socialLinks,
  };

  return jsonResponse(ok(publicProfile), { headers: PUBLIC_CACHE_HEADERS });
};
