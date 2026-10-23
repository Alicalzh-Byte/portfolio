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
import { requireAdminIdentity, verifyAdminSession } from './lib/server/auth';
import { errorResponse, internalErrorResponse, SECURITY_HEADERS } from './lib/server/http';
import { getRuntimeEnv } from './lib/server/runtime-env';

/** 需要后台身份才能访问的路径前缀。 */
const PROTECTED_PREFIXES = ['/api/admin', '/admin'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (isProtected(pathname)) {
    const env = getRuntimeEnv();
    // 双层防线：优先 Cloudflare Access；未配置或未通过时，回退到自建密码会话。
    const identity =
      (await requireAdminIdentity(context.request, env)) ?? (await verifyAdminSession(context.request, env));

    if (!identity) {
      // 未通过鉴权时：接口返回 401 且**不含任何数据**；
      // 页面跳到登录页，不泄露后台是否存在哪些资源。
      if (pathname.startsWith('/api/')) {
        return errorResponse('UNAUTHORIZED', '需要登录后台才能访问。', { status: 401 });
      }

      const loginUrl = new URL('/admin-login', context.url);
      loginUrl.searchParams.set('next', pathname);
      return Response.redirect(loginUrl, 302);
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
