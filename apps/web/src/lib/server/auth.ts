/**
 * 后台鉴权（服务端专用）。
 *
 * 双层防线（AGENTS.md §4.2）：Cloudflare Access 在边缘挡一层，应用内**仍要**独立校验 JWT。
 * 绝不允许「Access 已经挡住了，应用内就跳过」——边缘策略被误删时，应用内这层是唯一兜底。
 *
 * 本模块不实现账号密码登录：自建登录意味着密码哈希、会话、防爆破、找回都要自己写，
 * 而 Cloudflare Access 在边缘完成身份验证，应用内不接触密码（TECH_DESIGN §1.3）。
 */

export type AdminIdentity = {
  /** Access 放行的邮箱 */
  email: string;
  /** Access 的 JWT subject，用于日志关联 */
  subject: string;
};

type AccessJwtPayload = {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  sub?: string;
};

type JwkKey = { kid?: string; kty: string; n: string; e: string; alg?: string; use?: string };

/** JWKS 在模块级缓存：同一 Worker 实例内的多次请求不必重复拉取证书。 */
let cachedKeys: { keys: JwkKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * 判断是否允许「无 Access 环境」放行。
 * 必须由显式环境变量开启，默认关闭 —— 禁止写 `if (isDev) return true` 这类后门。
 */
function isLocalAdminAllowed(env: Env | undefined): boolean {
  return env?.ALLOW_LOCAL_ADMIN === '1';
}

/** 从请求中取出 Access 注入的 JWT：优先用请求头，其次用 Cookie。 */
function extractToken(request: Request): string | null {
  const headerToken = request.headers.get('Cf-Access-Jwt-Assertion');
  if (headerToken) return headerToken;

  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;

  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'CF_Authorization') return rest.join('=');
  }
  return null;
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodePayload(token: string): AccessJwtPayload | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(segments[1] ?? ''));
    return JSON.parse(json) as AccessJwtPayload;
  } catch {
    return null;
  }
}

/** 拉取（并缓存）Access 的 JWKS。 */
async function fetchJwks(teamDomain: string): Promise<JwkKey[]> {
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < JWKS_TTL_MS) return cachedKeys.keys;

  const response = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`无法获取 Access 证书（HTTP ${response.status}）`);

  const body = (await response.json()) as { keys?: JwkKey[] };
  const keys = body.keys ?? [];
  cachedKeys = { keys, fetchedAt: now };
  return keys;
}

/** 用 Web Crypto 校验 RS256 签名。Workers 与 Node 都提供 crypto.subtle。 */
async function verifySignature(token: string, key: JwkKey): Promise<boolean> {
  const segments = token.split('.');
  const [header, payload, signature] = segments;
  if (!header || !payload || !signature) return false;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${header}.${payload}`);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, base64UrlToBytes(signature), signedData);
}

/**
 * 校验后台请求身份。
 *
 * 返回 null 表示「未通过」——调用方必须据此返回 401，且响应体**不得包含任何数据**
 * （AGENTS.md §6.2 第 5 条）。
 */
export async function requireAdminIdentity(request: Request, env: Env | undefined): Promise<AdminIdentity | null> {
  const teamDomain = env?.ACCESS_TEAM_DOMAIN ?? env?.CF_ACCESS_TEAM_DOMAIN;
  const expectedAudience = env?.ACCESS_JWT_AUD;

  // 未配置 Access 的环境（本地开发）：只有显式开启才放行，否则一律拒绝
  if (!teamDomain || !expectedAudience) {
    if (isLocalAdminAllowed(env)) {
      return { email: 'local-dev@example.invalid', subject: 'local-dev' };
    }
    return null;
  }

  const token = extractToken(request);
  if (!token) return null;

  const payload = decodePayload(token);
  if (!payload) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) return null;

  // 校验签发方：必须是配置的团队域，避免接受别处签发的 JWT
  const normalizedTeam = teamDomain.replace(/\/$/, '');
  if (payload.iss !== normalizedTeam) return null;

  // 校验受众：Access 应用会把 AUD 放在 aud（可能是字符串或数组）
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAudience)) return null;

  const segments = token.split('.');
  const headerSegment = segments[0];
  if (!headerSegment) return null;

  let keyId: string | undefined;
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerSegment))) as { kid?: string };
    keyId = header.kid;
  } catch {
    return null;
  }

  try {
    const keys = await fetchJwks(normalizedTeam);
    const candidate = keys.find((key) => (keyId ? key.kid === keyId : true));
    if (!candidate) return null;

    const valid = await verifySignature(token, candidate);
    if (!valid) return null;
  } catch {
    // 证书拉取失败或校验异常一律按未通过处理（fail closed）
    return null;
  }

  return {
    email: payload.email ?? 'unknown@access',
    subject: payload.sub ?? 'unknown',
  };
}
