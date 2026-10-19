/**
 * 媒体库接口（F5 · 图片）。
 *
 * 上传顺序是硬约束（AGENTS.md §4.3）：**校验 → 写存储（KV） → 写 media 表**；
 * 写库失败必须回滚刚写入的对象，否则会留下孤儿文件。
 * 格式判定只看文件头魔数（detectImageMime），不看扩展名与声明的 Content-Type —— 伪造后缀在这里被拒（PRD AC5.4）。
 */
import type { APIRoute } from 'astro';
import { ok } from '@portfolio/shared/api';
import { parsePageQuery, totalPages } from '@portfolio/shared/query';
import { ACCEPTED_IMAGE_MIMES, detectImageMime, MAX_UPLOAD_BYTES } from '@portfolio/shared/schemas';
import { getDb } from '../../../lib/server/db';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  NO_STORE_HEADERS,
} from '../../../lib/server/http';
import {
  countMedia,
  createMediaRecord,
  deleteMediaRecord,
  findMediaUsage,
  getMediaByKey,
  listMedia,
} from '../../../lib/server/repositories/media';
import {
  buildObjectKey,
  deleteObject,
  getMediaStore,
  putObject,
  readImageDimensions,
} from '../../../lib/server/storage';
import { requireAdmin } from './_shared';

/** 对象 key 形态：{yyyy}/{mm}/{uuid}.{ext}，与 storage.ts 的 buildObjectKey 输出保持一致。 */
const MEDIA_KEY_PATTERN = /^\d{4}\/\d{2}\/[A-Za-z0-9._-]+$/;

/** 上限的人类可读值，用于错误文案（5MB）。 */
const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/** 回滚已写入的对象。回滚失败不再抛出，以免掩盖触发回滚的原始错误。 */
async function rollbackUploadedObject(store: KVNamespace, key: string): Promise<void> {
  try {
    await deleteObject(store, key);
  } catch {
    // 已无更多补救手段；调用方仍会返回 500，这里只做尽力清理
  }
}

export const GET: APIRoute = async ({ url, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  try {
    const { page, pageSize, offset } = parsePageQuery(url.searchParams);
    const db = getDb();
    const [items, total] = await Promise.all([
      listMedia(db, { limit: pageSize, offset }),
      countMedia(db),
    ]);

    return jsonResponse(
      ok({ items }, { page, pageSize, total, totalPages: totalPages(total, pageSize) }),
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return internalErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return errorResponse('UNSUPPORTED_MEDIA_TYPE', '请使用 multipart/form-data 上传图片。', { status: 415 });
  }

  const store = getMediaStore();
  if (!store) return internalErrorResponse();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('VALIDATION_FAILED', '无法解析上传内容。', { status: 400 });
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return errorResponse('VALIDATION_FAILED', '缺少图片文件（字段名应为 file）。', {
      status: 400,
      fields: { file: '请选择一张图片' },
    });
  }
  if (fileEntry.size > MAX_UPLOAD_BYTES) {
    return errorResponse('PAYLOAD_TOO_LARGE', `单张图片不能超过 ${MAX_UPLOAD_MB}MB。`, { status: 413 });
  }

  const buffer = await fileEntry.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = detectImageMime(bytes);
  if (mime === null || !(ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime)) {
    return errorResponse(
      'UNSUPPORTED_MEDIA_TYPE',
      '仅支持 JPEG / PNG / WebP / GIF（按文件头判定，改后缀无效）。',
      { status: 415, fields: { file: '文件头不是受支持的图片格式' } },
    );
  }

  const key = buildObjectKey(mime);
  const dimensions = readImageDimensions(bytes, mime);
  const originalName = fileEntry.name ? fileEntry.name : null;

  try {
    await putObject(store, key, buffer, { mime, originalName });
  } catch {
    return internalErrorResponse();
  }

  try {
    const id = await createMediaRecord(getDb(), {
      key,
      mime,
      sizeBytes: fileEntry.size,
      width: dimensions.width,
      height: dimensions.height,
      originalName,
    });

    return jsonResponse(
      ok({
        id,
        key,
        mime,
        sizeBytes: fileEntry.size,
        width: dimensions.width,
        height: dimensions.height,
      }),
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch {
    // 先存储后库；这里写库失败，必须把刚写入的对象删掉，避免孤儿文件
    await rollbackUploadedObject(store, key);
    return internalErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  const denied = requireAdmin(locals);
  if (denied) return denied;

  const key = (url.searchParams.get('key') ?? '').trim();
  if (!MEDIA_KEY_PATTERN.test(key)) {
    return errorResponse('VALIDATION_FAILED', '缺少合法的图片 key。', {
      status: 400,
      fields: { key: 'key 格式不合法' },
    });
  }

  try {
    const db = getDb();
    if (!db) return internalErrorResponse();

    const record = await getMediaByKey(db, key);
    if (!record) return errorResponse('NOT_FOUND', '图片不存在。', { status: 404 });

    // 先扫描引用，把「删这张图会影响谁」回传给后台做二次确认（PRD AC5.5）
    const usage = await findMediaUsage(db, key);

    const store = getMediaStore();
    if (!store) return internalErrorResponse();

    // 先删存储对象再删索引：宁可留一条指向已删对象的索引（可清理），也不留孤儿文件
    await deleteObject(store, key);
    await deleteMediaRecord(db, key);

    return jsonResponse(ok({ deleted: key, usage }), { headers: NO_STORE_HEADERS });
  } catch {
    return internalErrorResponse();
  }
};
