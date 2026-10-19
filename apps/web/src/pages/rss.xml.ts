/**
 * RSS 订阅输出端点（PRD F4）。
 * 只包含已发布文章 —— 草稿不得出现在任何公开出口（AGENTS.md §7.1 第 7 条）。
 */
import type { APIRoute } from 'astro';
import { getDb } from '../lib/server/db';
import { getSettings } from '../lib/server/repositories/settings';
import { listPublishedPostsForFeed } from '../lib/server/repositories/posts';
import { PUBLIC_CACHE_HEADERS } from '../lib/server/http';
import { getRuntimeEnv } from '../lib/server/runtime-env';

/** XML 文本转义。正文是 Markdown 原文，必须转义后再放进 CDATA 之外的位置。 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CDATA 段内只需处理 ]]> 这一种终止序列。 */
function toCdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export const GET: APIRoute = async ({ site }) => {
  const db = getDb();
  const [settings, posts] = await Promise.all([getSettings(db), listPublishedPostsForFeed(db, 20)]);

  const baseUrl =
    getRuntimeEnv().SITE_URL ?? site?.toString() ?? new URL('https://example.pages.dev').toString();
  const siteTitle = settings.siteTitle || '个人网站';

  const items = posts
    .map((post) => {
      const url = new URL(`/blog/${post.slug}`, baseUrl).toString();
      const publishedAt = post.publishedAt ?? post.createdAt;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(publishedAt).toUTCString()}</pubDate>
${post.tags.map((tag) => `      <category>${escapeXml(tag.name)}</category>`).join('\n')}
      <description>${toCdata(post.summary ?? '')}</description>
      <content:encoded>${toCdata(post.contentMd)}</content:encoded>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(settings.siteSubtitle || siteTitle)}</description>
    <language>zh-cn</language>
    <atom:link href="${escapeXml(new URL('/rss.xml', baseUrl).toString())}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      ...PUBLIC_CACHE_HEADERS,
    },
  });
};
