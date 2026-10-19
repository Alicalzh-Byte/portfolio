/** JSON 字段的安全解析。数据库里的 JSON 列可能被手工改坏，解析失败一律退化为默认值。 */

/** 解析 JSON 数组；非数组、非法 JSON、null 都返回空数组。 */
export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 序列化数组为 JSON 文本（写库用）。 */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

/** SQLite 没有布尔类型，统一用 0/1 存储。 */
export function toBoolean(value: number | null | undefined): boolean {
  return value === 1;
}

export function toSqliteBoolean(value: boolean): number {
  return value ? 1 : 0;
}
