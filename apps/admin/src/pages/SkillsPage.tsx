import { skillGroupInputSchema, skillInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { Skill, SkillGroup } from '@portfolio/shared/types';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { FormFeedback } from '../components/FormFeedback';
import { SelectField, TextField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

const LEVEL_OPTIONS = [
  { value: '', label: '不展示熟练度' },
  { value: '1', label: '1 · 了解' },
  { value: '2', label: '2 · 熟悉' },
  { value: '3', label: '3 · 熟练' },
  { value: '4', label: '4 · 精通' },
  { value: '5', label: '5 · 专家' },
] as const;

type SkillForm = { groupId: string; name: string; level: string; sortOrder: string };
type GroupForm = { name: string; sortOrder: string };

const INITIAL_SKILL: SkillForm = { groupId: '', name: '', level: '', sortOrder: '0' };
const INITIAL_GROUP: GroupForm = { name: '', sortOrder: '0' };

/** 技能页（F2）：分组与技能的真实列表 + 新增 / 删除 / 显隐。 */
export function SkillsPage() {
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [showSkillForm, setShowSkillForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [form, setForm] = useState<SkillForm>(INITIAL_SKILL);
  const [groupForm, setGroupForm] = useState<GroupForm>(INITIAL_GROUP);
  const { status, message, fieldErrors, isSaving, run, reset } = useSubmitState();

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: SkillGroup[] }>(ADMIN_API.skillGroups);
      setGroups(data.items);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : '读取技能失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof SkillForm>(key: K, value: SkillForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await run(async () => {
      const parsed = skillInputSchema.safeParse({
        groupId: form.groupId,
        name: form.name,
        level: form.level === '' ? null : form.level,
        sortOrder: form.sortOrder,
      });

      if (!parsed.success) {
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          message: '请检查表单填写',
          fields: toFieldErrors(parsed.error),
        });
      }

      await apiClient.post(ADMIN_API.skills, parsed.data);
      return '技能已新增';
    });

    if (ok) {
      setForm(INITIAL_SKILL);
      setShowSkillForm(false);
      reset();
      await load();
    }
  }

  async function handleGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = skillGroupInputSchema.safeParse({
      name: groupForm.name,
      sortOrder: groupForm.sortOrder,
    });
    if (!parsed.success) {
      setActionMessage(Object.values(toFieldErrors(parsed.error))[0] ?? '分组信息有误');
      return;
    }

    try {
      await apiClient.post(ADMIN_API.skillGroups, parsed.data);
      setGroupForm(INITIAL_GROUP);
      setShowGroupForm(false);
      setActionMessage('分组已新增');
      await load();
    } catch (error) {
      setActionMessage(error instanceof ApiRequestError ? error.message : '新增分组失败');
    }
  }

  async function deleteGroup(group: SkillGroup) {
    if (!window.confirm(`删除分组「${group.name}」会同时删除组内 ${group.skills.length} 个技能，确定？`)) {
      return;
    }
    try {
      await apiClient.delete(`${ADMIN_API.skillGroups}/${group.id}`);
      setActionMessage('分组已删除');
      await load();
    } catch (error) {
      setActionMessage(error instanceof ApiRequestError ? error.message : '删除分组失败');
    }
  }

  async function deleteSkill(skill: Skill) {
    if (!window.confirm(`确定删除技能「${skill.name}」？`)) return;
    try {
      await apiClient.delete(`${ADMIN_API.skills}/${skill.id}`);
      setActionMessage('技能已删除');
      await load();
    } catch (error) {
      setActionMessage(error instanceof ApiRequestError ? error.message : '删除技能失败');
    }
  }

  async function toggleSkill(skill: Skill) {
    try {
      await apiClient.put(`${ADMIN_API.skills}/${skill.id}`, {
        groupId: skill.groupId,
        name: skill.name,
        icon: skill.icon,
        level: skill.level,
        sortOrder: skill.sortOrder,
        visible: !skill.visible,
      });
      setActionMessage(skill.visible ? '技能已隐藏' : '技能已显示');
      await load();
    } catch (error) {
      setActionMessage(error instanceof ApiRequestError ? error.message : '更新技能失败');
    }
  }

  const groupOptions = groups.map((group) => ({ value: String(group.id), label: group.name }));

  return (
    <>
      <PageHeader
        title="技能"
        description="按分组组织技能条目，可设置 1~5 档熟练度与排序。空的熟练度不会渲染进度条。"
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setShowGroupForm((value) => !value)}>
              {showGroupForm ? '收起分组表单' : '新增分组'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setShowSkillForm((value) => !value)}>
              {showSkillForm ? '收起技能表单' : '新增技能'}
            </button>
          </>
        }
      />

      {showGroupForm ? (
        <section className="section">
          <form className="card" onSubmit={handleGroupSubmit} noValidate>
            <div className="form-grid">
              <TextField
                id="group-name"
                label="分组名称"
                value={groupForm.name}
                onChange={(value) => setGroupForm((previous) => ({ ...previous, name: value }))}
                required
                placeholder="例如：前端"
              />
              <TextField
                id="group-sortOrder"
                label="排序（越小越靠前）"
                type="number"
                value={groupForm.sortOrder}
                onChange={(value) => setGroupForm((previous) => ({ ...previous, sortOrder: value }))}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary">
                保存分组
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {showSkillForm ? (
        <section className="section">
          <form className="card" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <SelectField
                id="skill-groupId"
                label="所属分组"
                value={form.groupId}
                onChange={(value) => update('groupId', value)}
                options={[{ value: '', label: groups.length ? '请选择分组' : '请先新增分组' }, ...groupOptions]}
                error={fieldErrors.groupId}
                required
                disabled={isSaving}
              />
              <TextField
                id="skill-name"
                label="技能名称"
                value={form.name}
                onChange={(value) => update('name', value)}
                error={fieldErrors.name}
                required
                disabled={isSaving}
              />
              <SelectField
                id="skill-level"
                label="熟练度"
                value={form.level}
                onChange={(value) => update('level', value)}
                options={LEVEL_OPTIONS}
                error={fieldErrors.level}
                disabled={isSaving}
              />
              <TextField
                id="skill-sortOrder"
                label="排序"
                type="number"
                value={form.sortOrder}
                onChange={(value) => update('sortOrder', value)}
                disabled={isSaving}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving ? '保存中…' : '保存技能'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowSkillForm(false)} disabled={isSaving}>
                取消
              </button>
              <FormFeedback status={status} message={message} />
            </div>
          </form>
        </section>
      ) : null}

      <section className="section" aria-labelledby="skills-list-title">
        <div className="section__head">
          <h2 className="section__title" id="skills-list-title">
            技能分组
          </h2>
          <p className="section__note">{loading ? '正在读取…' : `共 ${groups.length} 个分组`}</p>
        </div>

        {loadError ? <p className="muted">{loadError}</p> : null}
        {actionMessage ? <p className="muted">{actionMessage}</p> : null}

        {!loading && groups.length === 0 ? (
          <EmptyState
            title="还没有技能分组"
            description="先新增分组，再把技能条目归入分组。"
            action={
              <button type="button" className="btn btn--primary" onClick={() => setShowGroupForm(true)}>
                新增分组
              </button>
            }
          />
        ) : (
          <div className="stack">
            {groups.map((group) => (
              <div className="card group-block" key={group.id}>
                <div className="group-block__head">
                  <h3 className="group-block__title">{group.name}</h3>
                  <span className="muted">排序 {group.sortOrder}</span>
                  <button type="button" className="btn btn--ghost" onClick={() => void deleteGroup(group)}>
                    删除分组
                  </button>
                </div>
                {group.skills.length === 0 ? (
                  <p className="muted">这个分组还没有技能。</p>
                ) : (
                  <ul className="skill-list">
                    {group.skills.map((skill) => (
                      <li className="skill-list__item" key={skill.id}>
                        <span className={skill.visible ? '' : 'muted'}>
                          {skill.name}
                          {skill.level ? ` · Lv.${skill.level}` : ''}
                        </span>
                        <span className="row-actions">
                          <button type="button" className="btn btn--ghost" onClick={() => void toggleSkill(skill)}>
                            {skill.visible ? '隐藏' : '显示'}
                          </button>
                          <button type="button" className="btn btn--ghost" onClick={() => void deleteSkill(skill)}>
                            删除
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
