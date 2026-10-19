/**
 * 图片读取端点：把 KV 中的对象以受控路径暴露出去。
 *
 * 为什么不直接用存储的公开域名（R2 的 r2.dev 之类）：走这里可以在将来加访问策略、
 * 改存储后端或加图片处理，而不用改动任何页面里的链接（链接形态始终是 /media/{key}）。
 * 这里配 Cache-Control 让边缘缓存，避免每次回源 KV。
 */
import type { APIRoute } from 'astro';
import { getMediaStore, getObject } from '../../lib/server/storage';
import { SECURITY_HEADERS } from '../../lib/server/http';

export const GET: APIRoute = async ({ params }) => {
  const segments = params.key;
  if (!segments) return new Response('Not Found', { status: 404 });

  // 兜底防路径穿越：key 由服务端生成，形如 2026/10/uuid.webp
  if (segments.includes('..')) return new Response('Bad Request', { status: 400 });

  const store = getMediaStore();
  if (!store) return new Response('Not Found', { status: 404 });

  const object = await getObject(store, segments);
  if (!object) return new Response('Not Found', { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': object.mime,
      // 图片 key 含 uuid，内容不会变，因此可以长缓存
      'cache-control': 'public, max-age=31536000, immutable',
      ...SECURITY_HEADERS,
    },
  });
};
