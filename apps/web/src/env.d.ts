/// <reference types="astro/client" />

/**
 * 运行时绑定与环境变量的类型声明。
 *
 * ⚠️ 与 TECH_DESIGN 的一处必要偏离：
 * `@astrojs/cloudflare` v14（Astro v6+）**已移除** `Astro.locals.runtime.env` ——
 * 访问它会直接抛错，官方替代方案是 workerd 注入的虚拟模块 `cloudflare:workers` 导出的 `env`。
 * 因此本项目所有服务端代码统一经 `src/lib/server/runtime-env.ts` 取绑定，不再经过 locals。
 */

type D1Database = import('@cloudflare/workers-types').D1Database;
type KVNamespace = import('@cloudflare/workers-types').KVNamespace;

interface Env {
  /** D1 数据库绑定（wrangler.toml 中的 [[d1_databases]]） */
  DB: D1Database;
  /** 图片存储绑定（wrangler.toml 中的 [[kv_namespaces]]）。绑定名沿用 MEDIA，后端已从 R2 换成 KV。 */
  MEDIA: KVNamespace;
  /** 站点对外地址，用于 RSS / sitemap 的绝对链接 */
  SITE_URL?: string;
  /** Cloudflare Access 团队域，用于校验 JWT 的 iss */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 应用的 AUD 标签，用于校验 JWT 的 aud */
  ACCESS_JWT_AUD?: string;
  /**
   * 本地开发放行开关：仅当显式等于 '1' 时，才在缺少 Access 的环境中放行后台。
   * 默认关闭，绝不允许写成「开发环境恒为 true」的后门。
   */
  ALLOW_LOCAL_ADMIN?: string;
  /** Access 团队域（备用命名，与 ACCESS_TEAM_DOMAIN 等价） */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** 计算留言 IP 哈希用的盐值：只存哈希不存明文 IP，加盐避免被彩虹表反查 */
  MESSAGE_IP_SALT?: string;
}

/**
 * workerd 运行时注入的虚拟模块：`env` 即当前请求的绑定集合。
 * astro dev（由 Cloudflare Vite 插件跑在 workerd 中）、Pages 预览与线上都可用。
 */
declare module 'cloudflare:workers' {
  export const env: Env;
}

declare namespace App {
  interface Locals {
    /** 由 src/middleware.ts 在通过鉴权后写入，供后台 endpoint 复用身份 */
    adminEmail?: string;
  }
}
