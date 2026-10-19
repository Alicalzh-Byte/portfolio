/**
 * 图片存储读写（服务端专用）。
 *
 * 后端是 **Workers KV**，不是 R2 —— 这是对 TECH_DESIGN §1.5 的一处有意偏离：
 * R2 必须先绑定银行卡才能启用，而 KV 的免费额度（1GB 存储 / 10 万次读每天）**无需绑卡**，
 * 对个人站的图片量完全够用；换来的代价是下面这两条限制，在本项目里都不构成问题：
 *   1. 单值上限 25MiB —— 上传接口本来就把图片限制在 5MB 以内；
 *   2. 写入最终一致（全球同步约需 60 秒）—— key 含 uuid 且内容永不覆写，
 *      同一位置的写入后立刻读取是一致的，而读取端又走了 immutable 长缓存。
 * R2 若日后启用，只需把这里与 wrangler.toml 的绑定换回去，调用方无需改动。
 *
 * key 规则：`{yyyy}/{mm}/{uuid}.{ext}` —— 按时间分目录便于日后排查与批量清理，
 * uuid 保证唯一，不使用原始文件名（避免中文名、重名与路径穿越）。
 */
import { getRuntimeEnv } from './runtime-env';

/** 各格式对应的扩展名，用于生成 key。 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 随对象一起写进 KV 的元数据：MIME 用于回读时设置响应头，原始文件名仅供排查。 */
type MediaMetadata = { mime: string; originalName: string | null };

export function getMediaStore(): KVNamespace | null {
  return getRuntimeEnv()?.MEDIA ?? null;
}

/** 生成对象 key。 */
export function buildObjectKey(mime: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const extension = EXTENSION_BY_MIME[mime] ?? 'bin';
  return `${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/** 写入对象。MIME 与原始文件名放 KV metadata，回读时无需再查数据库。 */
export async function putObject(
  store: KVNamespace,
  key: string,
  body: ArrayBuffer,
  options: { mime: string; originalName: string | null },
): Promise<void> {
  const metadata: MediaMetadata = { mime: options.mime, originalName: options.originalName };
  await store.put(key, body, { metadata });
}

export async function getObject(
  store: KVNamespace,
  key: string,
): Promise<{ body: ReadableStream; mime: string } | null> {
  const result = await store.getWithMetadata<MediaMetadata>(key, { type: 'stream' });
  if (result.value === null) return null;

  return {
    body: result.value as unknown as ReadableStream,
    mime: result.metadata?.mime ?? 'application/octet-stream',
  };
}

export async function deleteObject(store: KVNamespace, key: string): Promise<void> {
  await store.delete(key);
}

/**
 * 从字节流里读出图片的真实宽高。
 *
 * 只支持 PNG / GIF 这两种「尺寸写在固定位置」的格式，
 * JPEG / WebP 需要解析变长的段结构，不值得为它引入一个图像解析库 ——
 * 这两种格式返回 null，前端按默认宽高比预留空间即可。
 */
export function readImageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number | null; height: number | null } {
  if (mime === 'image/png' && bytes.length > 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // IHDR 紧跟 8 字节签名 + 4 字节长度 + 4 字节类型，宽高各 4 字节大端
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if ((mime === 'image/gif') && bytes.length > 10) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  return { width: null, height: null };
}
