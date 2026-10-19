/**
 * settings 仓库 —— 站点级键值配置。
 *
 * 最重要的职责是 **content_version**：任何内容写操作成功后都必须自增它，
 * 否则边缘缓存会一直命中旧键，前台长时间看到旧内容（AGENTS.md §4.3）。
 */
import type { Settings } from '@portfolio/shared/types';
import { executeBatch, type getDb, nowUtc, queryMany } from '../db';

type SettingsRow = { key: string; value: string; updated_at: string };

const CONTENT_VERSION_KEY = 'content_version';

/** 未在库中出现过的键用这些值兜底，保证 `Settings` 类型始终完整。 */
const DEFAULTS: Settings = {
  siteTitle: '',
  siteSubtitle: '',
  defaultShareImage: null,
  accentColor: null,
  footerText: '',
  contentVersion: 1,
};

/**
 * 读取全部设置。
 * 只做一次查询（settings 是键值表，行数极少），然后在内存里组装成结构体。
 */
export async function getSettings(db: ReturnType<typeof getDb>): Promise<Settings> {
  const rows = await queryMany<SettingsRow>(db, 'SELECT key, value, updated_at FROM settings');

  const rawValues = new Map<string, string>();
  for (const row of rows) rawValues.set(row.key, row.value);

  const decodeString = (key: string, fallback: string): string => {
    // decodeJsonValue 也可能解出数字（例如误存的数值型设置），此处只接受字符串，其余回退默认值
    const decoded = decodeJsonValue(rawValues.get(key));
    return typeof decoded === 'string' ? decoded : fallback;
  };

  const decodedVersion = decodeJsonValue(rawValues.get(CONTENT_VERSION_KEY));
  const contentVersion =
    typeof decodedVersion === 'number' && Number.isFinite(decodedVersion)
      ? decodedVersion
      : DEFAULTS.contentVersion;

  return {
    siteTitle: decodeString('site_title', DEFAULTS.siteTitle),
    siteSubtitle: decodeString('site_subtitle', DEFAULTS.siteSubtitle),
    defaultShareImage: decodeString('default_share_image', '') || null,
    accentColor: decodeString('accent_color', '') || null,
    footerText: decodeString('footer_text', DEFAULTS.footerText),
    contentVersion,
  };
}

/** 去掉 JSON 编码层；非字符串/数字一律返回 null。 */
function decodeJsonValue(raw: string | undefined): string | number | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string' || typeof parsed === 'number') return parsed;
    return null;
  } catch {
    // 兼容早期可能写入的裸文本值
    return raw;
  }
}

/**
 * 读取单个设置项的原始值（后台设置页表单回填用）。
 */
export async function getSettingValue(
  db: ReturnType<typeof getDb>,
  key: string,
): Promise<string | null> {
  const rows = await queryMany<SettingsRow>(db, 'SELECT key, value, updated_at FROM settings WHERE key = ?', [key]);
  const decoded = decodeJsonValue(rows[0]?.value);
  return typeof decoded === 'string' ? decoded : null;
}

/**
 * 构造「自增内容版本号」语句。
 *
 * 返回语句而不是直接执行，是为了让调用方把它和内容写入放进同一个 batch（D1 的 batch 在单事务内执行），
 * 保证「内容改了」与「版本号涨了」要么都成立、要么都不发生。
 */
export function buildBumpContentVersionStatement(): { sql: string; parameters: unknown[] } {
  return {
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES (?, '1', ?)
          ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at`,
    parameters: [CONTENT_VERSION_KEY, nowUtc()],
  };
}

/** 构造「写入某个设置项」语句（value 会被 JSON 编码）。 */
export function buildSetSettingStatement(
  key: string,
  value: string | number,
): { sql: string; parameters: unknown[] } {
  return {
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    parameters: [key, JSON.stringify(value), nowUtc()],
  };
}

/**
 * 单独自增内容版本号（用于没有其他写入、但也需要让缓存失效的场景）。
 */
export async function bumpContentVersion(db: ReturnType<typeof getDb>): Promise<void> {
  if (!db) return;
  await executeBatch(db, [buildBumpContentVersionStatement()]);
}
