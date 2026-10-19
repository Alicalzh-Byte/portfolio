// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/**
 * Astro 配置（对齐 TECH_DESIGN §1.1 / §4.1）。
 *
 * `output: 'server'` 是刻意的选择：页面在 Workers 运行时按需渲染，数据来自 D1，
 * 这样后台保存内容后无需重新部署即可生效；纯静态生成会让「改了不生效」。
 *
 * `configPath` 必须显式指向仓库根目录的 wrangler.toml：
 * @astrojs/cloudflare v14 起本地 dev 由 Cloudflare Vite 插件驱动，D1 / R2 / vars 绑定全部
 * 来自 wrangler 配置；插件默认在**应用目录**（apps/web）下查找配置，而本仓库把它放在根目录
 * 供全仓共用，不显式指路就会「dev 能启动但拿不到任何绑定」，页面静默渲染成空状态。
 * （v11/v12 时代的 `platformProxy` 选项在 v14 已被移除，写上去会被忽略。）
 * 取值只能是**相对于应用目录的路径**：插件侧用 path.resolve(root, configPath) 解析，
 * 适配器侧用 new URL(configPath, config.root) 解析。绝对原生路径会被 new URL 当成 scheme 而报错，
 * file:// 字符串则会被 path.resolve 当成相对路径拼错 —— 只有相对路径两边都成立。
 */
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    configPath: '../../wrangler.toml',
    // 本地状态目录默认落在 Vite root（apps/web/.wrangler/state），
    // 而 `pnpm db:migrate:local` / `pnpm db:seed` 是以仓库根为工作目录运行的，
    // 两边各写一份库 → dev 里「表不存在」。这里显式指回仓库根，让 CLI 与 dev 共用同一个本地 D1。
    persistState: { path: '../../.wrangler/state' },
  }),
  site: process.env.SITE_URL ?? 'https://example.workers.dev',
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    // shared 以源码形式被消费：必须让 SSR 打包它，否则 Workers 侧会拿到无法解析的 .ts
    ssr: { noExternal: ['@portfolio/shared'] },
  },
});
