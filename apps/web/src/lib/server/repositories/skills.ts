/**
 * 技能仓库 —— 分组与其下的技能项。
 *
 * 一次查出「所有分组 + 所有技能」然后内存里归组，避免按分组逐条查询（N+1）。
 */
import type { Skill, SkillGroup } from '@portfolio/shared/types';
import { execute, executeBatch, type getDb, nowUtc, queryMany } from '../db';
import { toBoolean, toSqliteBoolean } from '../json';
import { buildBumpContentVersionStatement } from './settings';

type SkillGroupRow = {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SkillRow = {
  id: number;
  group_id: number;
  name: string;
  icon: string | null;
  level: number | null;
  sort_order: number;
  visible: number;
  created_at: string;
  updated_at: string;
};

const GROUP_COLUMNS = 'id, name, sort_order, created_at, updated_at';
const SKILL_COLUMNS = 'id, group_id, name, icon, level, sort_order, visible, created_at, updated_at';

function mapSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    icon: row.icon,
    level: row.level,
    sortOrder: row.sort_order,
    visible: toBoolean(row.visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 技能分组（含其下技能）。
 * @param visibleOnly 前台传 true：后台隐藏的技能不应出现在公开页面。
 */
export async function listSkillGroups(
  db: ReturnType<typeof getDb>,
  visibleOnly = true,
): Promise<SkillGroup[]> {
  const [groupRows, skillRows] = await Promise.all([
    queryMany<SkillGroupRow>(db, `SELECT ${GROUP_COLUMNS} FROM skill_groups ORDER BY sort_order ASC, id ASC`),
    queryMany<SkillRow>(
      db,
      `SELECT ${SKILL_COLUMNS} FROM skills
        ${visibleOnly ? 'WHERE visible = 1' : ''}
        ORDER BY sort_order ASC, id ASC`,
    ),
  ]);

  const skillsByGroup = new Map<number, Skill[]>();
  for (const row of skillRows) {
    const bucket = skillsByGroup.get(row.group_id) ?? [];
    bucket.push(mapSkill(row));
    skillsByGroup.set(row.group_id, bucket);
  }

  return groupRows
    .map((group) => ({
      id: group.id,
      name: group.name,
      sortOrder: group.sort_order,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      skills: skillsByGroup.get(group.id) ?? [],
    }))
    // 前台不展示空分组：一个没有任何技能的分组只会制造视觉噪音
    .filter((group) => !visibleOnly || group.skills.length > 0);
}

export async function createSkillGroup(db: ReturnType<typeof getDb>, name: string, sortOrder: number): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法新建技能分组');

  const now = nowUtc();
  const result = await execute(
    db,
    'INSERT INTO skill_groups (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [name, sortOrder, now, now],
  );

  const id = result.meta?.last_row_id;
  if (typeof id !== 'number') throw new Error('技能分组写入失败');

  await executeBatch(db, [buildBumpContentVersionStatement()]);
  return id;
}

export async function updateSkillGroup(
  db: ReturnType<typeof getDb>,
  id: number,
  name: string,
  sortOrder: number,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法更新技能分组');
  await executeBatch(db, [
    {
      sql: 'UPDATE skill_groups SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?',
      parameters: [name, sortOrder, nowUtc(), id],
    },
    buildBumpContentVersionStatement(),
  ]);
}

export async function deleteSkillGroup(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除技能分组');
  // skills 上有 ON DELETE CASCADE，组内技能会一并清理
  await executeBatch(db, [
    { sql: 'DELETE FROM skill_groups WHERE id = ?', parameters: [id] },
    buildBumpContentVersionStatement(),
  ]);
}

export type SkillInput = {
  groupId: number;
  name: string;
  icon: string | null;
  level: number | null;
  sortOrder: number;
  visible: boolean;
};

export async function createSkill(db: ReturnType<typeof getDb>, input: SkillInput): Promise<number> {
  if (!db) throw new Error('缺少 D1 绑定，无法新建技能');

  const now = nowUtc();
  const result = await execute(
    db,
    `INSERT INTO skills (group_id, name, icon, level, sort_order, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.groupId,
      input.name,
      input.icon,
      input.level,
      input.sortOrder,
      toSqliteBoolean(input.visible),
      now,
      now,
    ],
  );

  const id = result.meta?.last_row_id;
  if (typeof id !== 'number') throw new Error('技能写入失败');

  await executeBatch(db, [buildBumpContentVersionStatement()]);
  return id;
}

export async function updateSkill(
  db: ReturnType<typeof getDb>,
  id: number,
  input: SkillInput,
): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法更新技能');
  await executeBatch(db, [
    {
      sql: `UPDATE skills
               SET group_id = ?, name = ?, icon = ?, level = ?, sort_order = ?, visible = ?, updated_at = ?
             WHERE id = ?`,
      parameters: [
        input.groupId,
        input.name,
        input.icon,
        input.level,
        input.sortOrder,
        toSqliteBoolean(input.visible),
        nowUtc(),
        id,
      ],
    },
    buildBumpContentVersionStatement(),
  ]);
}

export async function deleteSkill(db: ReturnType<typeof getDb>, id: number): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法删除技能');
  await executeBatch(db, [
    { sql: 'DELETE FROM skills WHERE id = ?', parameters: [id] },
    buildBumpContentVersionStatement(),
  ]);
}

/**
 * 按传入顺序重排。
 * 整批提交而非逐条 PATCH：逐条提交会留下「排到一半」的中间态，前端会看到闪烁的顺序。
 */
export async function reorderSkills(db: ReturnType<typeof getDb>, ids: number[]): Promise<void> {
  if (!db) throw new Error('缺少 D1 绑定，无法排序');

  const statements: { sql: string; parameters: unknown[] }[] = ids.map((id, index) => ({
    sql: 'UPDATE skills SET sort_order = ?, updated_at = ? WHERE id = ?',
    parameters: [index, nowUtc(), id],
  }));
  statements.push(buildBumpContentVersionStatement());

  await executeBatch(db, statements);
}
