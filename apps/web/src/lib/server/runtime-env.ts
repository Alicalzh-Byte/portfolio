/**
 * 运行时绑定的唯一取用入口（服务端专用）。
 *
 * 为什么需要这一层：`@astrojs/cloudflare` v14 起 `Astro.locals.runtime.env` 已被移除，
 * 访问即抛错；官方替代是 workerd 提供的虚拟模块 `cloudflare:workers`。
 * 全站统一从这里取绑定，避免同一条 import 语句散落在十几个文件里。
 */
import { env as workerEnv } from 'cloudflare:workers';

/** 当前请求的绑定集合（D1 / R2 / 环境变量）。 */
export function getRuntimeEnv(): Env {
  return workerEnv;
}
