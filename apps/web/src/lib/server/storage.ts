/**
 * R2 存储读写（服务端专用）。
 *
 * key 规则：`{yyyy}/{mm}/{uuid}.{ext}` —— 按时间分目录便于日后排查与批量清理，
 * uuid 保证唯一，不使用原始文件名（避免中文名、重名与路径穿越）。
 */
import type { R2Bucket } from '@cloudflare/workers-types';
import { getRuntimeEnv } from './runtime-env';

/** 各格式对应的扩展名，用于生成 key。 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function getMediaBucket(): R2Bucket | null {
  return getRuntimeEnv()?.MEDIA ?? null;
}

/** 由显式传入的绑定集合取得 R2 桶（已持有 env 的场景，例如后台上传端点）。 */
export function getMediaBucketFromEnv(runtimeEnv: Env | undefined): R2Bucket | null {
  return runtimeEnv?.MEDIA ?? null;
}

/** 生成对象 key。 */
export function buildObjectKey(mime: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const extension = EXTENSION_BY_MIME[mime] ?? 'bin';
  return `${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

/** 写入对象。metadata 里带上原始文件名与 MIME，便于日后排查与直接回读。 */
export async function putObject(
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer,
  options: { mime: string; originalName: string | null },
): Promise<void> {
  await bucket.put(key, body, {
    httpMetadata: { contentType: options.mime },
    customMetadata: options.originalName ? { originalName: options.originalName } : {},
  });
}

export async function getObject(
  bucket: R2Bucket,
  key: string,
): Promise<{ body: ReadableStream; mime: string } | null> {
  const object = await bucket.get(key);
  if (!object) return null;

  return {
    body: object.body as unknown as ReadableStream,
    mime: object.httpMetadata?.contentType ?? 'application/octet-stream',
  };
}

export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
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
