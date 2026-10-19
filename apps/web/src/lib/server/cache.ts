/**
 * 边缘缓存读写（服务端专用）。
 *
 * 核心机制（TECH_DESIGN §4.2）：缓存键**必须包含 content_version**。
 * 内容一旦被修改，版本号自增 → 旧键自然失效，因此**不需要主动 purge**。
 * 这也是 AGENTS.md 禁止自行拼接缓存键的原因：漏掉版本号会导致前台长时间看到旧内容。
 */
import type { Cache, CacheStorage, Response as WorkerResponse } from '@cloudflare/workers-types';

/** 缓存条目在边缘的存活时间（秒）。个人站内容变化不频繁，可以用较长的 TTL。 */
const EDGE_TTL_SECONDS = 300;

/**
 * 缓存键的基地址。
 *
 * Cache API 要求 key 是**完全限定的合法 URL**，否则 `caches.default.match()` 会抛
 * "Cache API keys must be fully-qualified, valid URLs"。
 * 这里用一个私有占位域名：同 zone 内匹配只用 path + query，域名仅用于通过校验。
 */
const CACHE_KEY_BASE = 'https://portfolio-cache.internal/';

/** 缓存键的版本段，便于将来整体换键规则而不与历史键混淆。 */
const CACHE_KEY_VERSION = 'v1';

/**
 * 组装缓存键。
 * @param namespace 资源命名空间，如 posts / profile / tags
 * @param contentVersion 由 settings.content_version 提供
 * @param parts 其余区分维度（分页、标签、slug 等）
 */
export function buildCacheKey(
  namespace: string,
  contentVersion: number,
  parts: Record<string, string | number> = {},
): string {
  const url = new URL(`${CACHE_KEY_VERSION}/${namespace}`, CACHE_KEY_BASE);
  url.searchParams.set('v', String(contentVersion));
  for (const [field, value] of Object.entries(parts).sort(([a], [b]) => a.localeCompare(b))) {
    url.searchParams.set(field, String(value));
  }
  return url.toString();
}

/**
 * Cache API 的读写封装。
 *
 * Workers 运行时提供 caches.default；本地 Node 环境（astro dev / Vitest）没有，
 * 因此这里必须容忍 absence —— 拿不到就退化为「每次都回源」，功能正确性不受影响。
 */
function getCache(): Cache | null {
  // 双重断言：DOM lib 与 @cloudflare/workers-types 都声明了全局 `caches`，但形状不同
  // （DOM 的 CacheStorage 没有 default）。先转 unknown 再按 Workers 的形状收窄，避免两套声明冲突。
  const cacheStorage = (globalThis as unknown as { caches?: CacheStorage }).caches;
  return cacheStorage?.default ?? null;
}

/**
 * 读缓存。命中返回解析后的 JSON，未命中或环境不支持时返回 null。
 * 解析失败按未命中处理，避免一条脏缓存把整个接口打挂。
 */
export async function readCache<T>(key: string): Promise<T | null> {
  const cache = getCache();
  if (!cache) return null;

  // 类型必须用 Workers 的 Response：cache.match() 返回的是 @cloudflare/workers-types 的 Response，
  // 与全局 DOM 的 Response 不是同一个类型（属性集不同），混用会报 TS2322。
  let response: WorkerResponse | undefined;
  try {
    response = await cache.match(key);
  } catch (error) {
    // 缓存是纯性能优化，任何缓存层异常都不得让请求失败（键不合法、配额超限等都在此兜住）
    console.error('[cache] 读取缓存失败，退化为回源：', error);
    return null;
  }
  if (!response) return null;

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** 写缓存。失败静默忽略：缓存是性能优化，不该因为写缓存失败而让请求失败。 */
export async function writeCache(key: string, payload: unknown): Promise<void> {
  const cache = getCache();
  if (!cache) return;

  try {
    await cache.put(
      key,
      // DOM lib 与 Workers 各自声明了 Response，属性集不同（Workers 侧多 webSocket / cf）。
      // 运行时用的一定是 Workers 的实现，这里断言以跨过两套声明的差异。
      new Response(JSON.stringify(payload), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${EDGE_TTL_SECONDS}`,
        },
      }) as unknown as WorkerResponse,
    );
  } catch {
    // 忽略：TTL 到期后自然回源
  }
}

/**
 * 「有缓存用缓存、没有就算一遍再写入」的通用读法。
 * 所有公开只读接口都应走这里，以保证缓存键规则只有一处实现。
 */
export async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(key);
  if (hit !== null) return hit;

  const fresh = await loader();
  await writeCache(key, fresh);
  return fresh;
}
