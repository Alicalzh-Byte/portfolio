/**
 * 站点地图输出端点（PRD F4）。
 * 只收录已发布文章与全部项目；草稿不得出现在这里（AC4.6 / AGENTS.md §7.1 第 7 条）。
 */
import type { APIRoute } from 'astro';
import { getDb } from '../lib/server/db';
import { listPublishedPostSlugs } from '../lib/server/repositories/posts';
import { listProjectSlugs } from '../lib/server/repositories/projects';
import { listTags } from '../lib/server/repositories/tags';
import { PUBLIC_CACHE_HEADERS } from '../lib/server/http';
import { getRuntimeEnv } from '../lib/server/runtime-env';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ site }) => {
  const db = getDb();
  const [postSlugs, projectSlugs, tags] = await Promise.all([
    listPublishedPostSlugs(db),
    listProjectSlugs(db),
    listTags(db),
  ]);

  const baseUrl =
    getRuntimeEnv().SITE_URL ?? site?.toString() ?? new URL('https://example.pages.dev').toString();

  const entries: { loc: string; lastmod: string; priority: string }[] = [
    { loc: '/', lastmod: '', priority: '1.0' },
    { loc: '/about', lastmod: '', priority: '0.8' },
    { loc: '/projects', lastmod: '', priority: '0.9' },
    { loc: '/blog', lastmod: '', priority: '0.9' },
    { loc: '/contact', lastmod: '', priority: '0.5' },
  ];

  for (const project of projectSlugs) {
    entries.push({ loc: `/projects/${project.slug}`, lastmod: project.updatedAt, priority: '0.7' });
  }
  for (const post of postSlugs) {
    entries.push({ loc: `/blog/${post.slug}`, lastmod: post.updatedAt, priority: '0.7' });
  }
  for (const tag of tags) {
    entries.push({ loc: `/tags/${tag.slug}`, lastmod: '', priority: '0.4' });
  }

  const urls = entries
    .map((entry) => {
      const loc = escapeXml(new URL(entry.loc, baseUrl).toString());
      const lastmod = entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod.slice(0, 10))}</lastmod>` : '';
      return `  <url>
    <loc>${loc}</loc>${lastmod}
    <priority>${entry.priority}</priority>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      ...PUBLIC_CACHE_HEADERS,
    },
  });
};
