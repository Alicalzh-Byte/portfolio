/**
 * 上传魔法字节校验的单元测试（PRD AC5.4）。
 *
 * 只测 shared 里的纯函数 detectImageMime：它决定「改后缀能不能绕过校验」。
 * 这里刻意构造「文件头不是图片但扩展名是 .png」的场景，确保拒绝逻辑与扩展名/Content-Type 无关。
 */
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_IMAGE_MIMES,
  detectImageMime,
  MAX_UPLOAD_BYTES,
} from '../../packages/shared/src/schemas';

/** 用给定字节构造一个足以让魔数判定生效的定长数组（不足处补 0）。 */
function bytesOf(prefix: number[], total = 16): Uint8Array {
  const buffer = new Uint8Array(total);
  buffer.set(prefix, 0);
  return buffer;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
// RIFF....WEBP
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

describe('detectImageMime（按文件头判定，忽略扩展名与 Content-Type）', () => {
  it('识别受支持的真实图片格式', () => {
    expect(detectImageMime(bytesOf(PNG_MAGIC))).toBe('image/png');
    expect(detectImageMime(bytesOf(JPEG_MAGIC))).toBe('image/jpeg');
    expect(detectImageMime(bytesOf(GIF_MAGIC))).toBe('image/gif');
    expect(detectImageMime(bytesOf(WEBP_MAGIC))).toBe('image/webp');
  });

  it('拒绝伪装成图片的脚本内容（把 .png 后缀的文本文件改名上传）', () => {
    const scriptBytes = new TextEncoder().encode('<?php system($_GET["c"]); ?>');
    expect(detectImageMime(scriptBytes)).toBeNull();
  });

  it('拒绝过短的文件头（无法判定，一律拒收）', () => {
    expect(detectImageMime(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageMime(new Uint8Array(0))).toBeNull();
  });

  it('返回值只会落在 ACCEPTED_IMAGE_MIMES 白名单内', () => {
    for (const sample of [PNG_MAGIC, JPEG_MAGIC, GIF_MAGIC, WEBP_MAGIC]) {
      const mime = detectImageMime(bytesOf(sample));
      expect(mime).not.toBeNull();
      expect(ACCEPTED_IMAGE_MIMES).toContain(mime);
    }
  });

  it('上传大小上限为 5MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
});
