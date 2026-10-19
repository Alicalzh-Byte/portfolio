/**
 * 把后台 SPA 的构建产物搬进 Worker 的静态资源目录。
 *
 * 为什么需要这一步：Cloudflare 只会部署 apps/web 的产物（Worker + 静态资源），
 * apps/admin 是独立构建的 SPA，产物不会被自动带上；不搬进来，线上 /admin 必然 404。
 * 本地与 Cloudflare 构建走的是同一个 `pnpm build`，所以这一步接在 build 末尾，
 * 保证两边行为完全一致。
 *
 * 目标目录不写死成 dist/client，而是从适配器生成的 apps/web/dist/server/wrangler.json
 * 里读 assets.directory —— 它是 @astrojs/cloudflare 计算出来的真正会被上传的目录
 * （站点若设了 base 前缀，路径会不同），跟着它走才不会错位。
 */
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adminDist = resolve(root, 'apps/admin/dist');
const wranglerJsonPath = resolve(root, 'apps/web/dist/server/wrangler.json');

const wranglerConfig = JSON.parse(await readFile(wranglerJsonPath, 'utf8')) as {
  assets?: { directory?: string };
};
const assetsDirectory = wranglerConfig.assets?.directory;
if (!assetsDirectory) {
  throw new Error(`${wranglerJsonPath} 中缺少 assets.directory，无法确定静态资源目录`);
}

const target = resolve(dirname(wranglerJsonPath), assetsDirectory, 'admin');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

// 逐个顶层条目复制：目标目录是新建的空目录，逐条 cp 的落点确定，
// 不会出现“整体 cp 时被套成 admin/dist”的歧义。
for (const entry of await readdir(adminDist)) {
  await cp(resolve(adminDist, entry), resolve(target, entry), { recursive: true });
}

console.log(`[copy-admin] ${adminDist} -> ${target}`);
