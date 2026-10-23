/**
 * 自建密码登录接口（Access 不可用时的兜底方案）。
 *
 * 只接受 POST：表单方式提交后 303 跳转，JSON 方式返回统一信封。
 * 成功时写入 HttpOnly + Secure + SameSite=Lax 的签名会话 cookie，有效期 12 小时。
 */
import type { APIRoute } from 'astro';
import {
  createAdminSessionCookie,
  isPasswordLoginConfigured,
  verifyAdminPassword,
} from '../../lib/server/auth';
import { errorResponse, SECURITY_HEADERS } from '../../lib/server/http';
import { getRuntimeEnv } from '../../lib/server/runtime-env';

export const prerender = false;

/** 只允许跳回后台路径，防止开放重定向。 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/admin')) return '/admin/';
  if (value.startsWith('//') || value.includes('\\')) return '/admin/';
  return value;
}

export const POST: APIRoute = async ({ request }) => {
  const env = getRuntimeEnv();
  const contentType = request.headers.get('content-type') ?? '';
  const isForm =
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data');

  let password = '';
  let next = '/admin/';

  if (isForm) {
    const form = await request.formData();
    password = String(form.get('password') ?? '');
    next = safeNext(form.get('next')?.toString() ?? null);
  } else {
    const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
    password = typeof body?.password === 'string' ? body.password : '';
  }

  if (!isPasswordLoginConfigured(env)) {
    if (isForm) return Response.redirect(new URL('/admin-login?error=config', request.url), 303);
    return errorResponse('INTERNAL_ERROR', '后台未配置密码登录。', { status: 500 });
  }

  if (!verifyAdminPassword(env, password)) {
    if (isForm) return Response.redirect(new URL('/admin-login?error=1', request.url), 303);
    return errorResponse('UNAUTHORIZED', '密码不正确。', { status: 401 });
  }

  const cookie = await createAdminSessionCookie(env);
  const headers = new Headers({ ...SECURITY_HEADERS, 'cache-control': 'no-store' });
  if (cookie) headers.set('set-cookie', cookie);

  if (isForm) {
    headers.set('location', next);
    return new Response(null, { status: 303, headers });
  }

  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: true, data: { next } }), { status: 200, headers });
};
