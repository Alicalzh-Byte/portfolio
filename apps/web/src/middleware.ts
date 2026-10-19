/**
 * Astro 中间件 —— 承担 TECH_DESIGN 中 `_middleware.ts` 的职责：
 * 鉴权 + 错误包装 + 安全响应头。
 *
 * ⚠️ 为什么不是 `functions/_middleware.ts`：
 * @astrojs/cloudflare 适配器以「advanced mode」生成 `dist/_worker.js`，由 Astro 独占整个 Worker；
 * Cloudflare Pages 不允许 `_worker.js` 与 `functions/` 目录共存。
 * 因此路由处理统一落在 Astro endpoint（`src/pages/api/**`）里 —— 运行时仍是
 * Cloudflare Workers，能力与约束不变，只是文件位置变了。
 */
import { defineMiddleware } from 'astro:middleware';
import { requireAdminIdentity } from './lib/server/auth';
import { errorResponse, internalErrorResponse, NO_STORE_HEADERS, SECURITY_HEADERS } from './lib/server/http';
import { getRuntimeEnv } from './lib/server/runtime-env';

/** 需要后台身份才能访问的路径前缀。 */
const PROTECTED_PREFIXES = ['/api/admin', '/admin'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (isProtected(pathname)) {
    const identity = await requireAdminIdentity(context.request, getRuntimeEnv());

    if (!identity) {
      // 未通过鉴权时：接口返回 401 且**不含任何数据**；
      // 页面跳到一个明确的拒绝提示，不泄露后台是否存在哪些资源。
      if (pathname.startsWith('/api/')) {
        return errorResponse('UNAUTHORIZED', '需要登录后台才能访问。', { status: 401 });
      }

      return new Response(
        `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
         <meta name="viewport" content="width=device-width, initial-scale=1">
         <meta name="robots" content="noindex, nofollow">
         <title>401 · 需要登录</title>
         <style>html{background:#0a0b14;color:#eceef7;font-family:system-ui,sans-serif}
         body{display:grid;min-height:100vh;margin:0;place-items:center;text-align:center}
         p{color:#a6abc2;max-width:44ch;line-height:1.7}</style></head>
         <body><main><h1>401 · 需要登录</h1>
         <p>后台由 Cloudflare Access 保护。请通过 Access 完成身份验证后再访问。</p>
         </main></body></html>`,
        {
          status: 401,
          headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...NO_STORE_HEADERS },
        },
      );
    }

    // 身份存入 locals，后续 endpoint 直接复用，避免重复校验 JWT
    context.locals.adminEmail = identity.email;
  }

  try {
    const response = await next();
    // 统一补安全头（Astro 静态响应默认不带这些）
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
    return response;
  } catch (error) {
    // 兜底：不让异常直接把堆栈吐给访客。原始错误只记在服务端日志里，便于排查。
    console.error('[middleware] 渲染失败：', error);
    if (pathname.startsWith('/api/')) return internalErrorResponse();
    // 附上 cause：页面侧重抛时保留原始错误链，便于在日志里追到根因
    throw new Error('页面渲染失败', { cause: error });
  }
});
