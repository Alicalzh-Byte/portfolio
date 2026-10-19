import { skillInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { FormEvent } from 'react';
import { useState } from 'react';
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

type SkillForm = { groupId: string; name: string; level: string };

const INITIAL_FORM: SkillForm = { groupId: '', name: '', level: '' };

/** 技能页（F2）：工具栏 + 分组列表壳（空状态）+ 新增技能表单脚手架。 */
export function SkillsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SkillForm>(INITIAL_FORM);
  const { status, message, fieldErrors, isSaving, run, reset } = useSubmitState();

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
      setForm(INITIAL_FORM);
      setShowForm(false);
      reset();
    }
  }

  return (
    <>
      <PageHeader
        title="技能"
        description="按分组组织技能条目，可设置 1~5 档熟练度与排序。空的熟练度不会渲染进度条。"
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setShowForm((value) => !value)}>
              {showForm ? '收起表单' : '新增技能'}
            </button>
          </>
        }
      />

      {showForm ? (
        <section className="section" aria-labelledby="skills-form-title">
          <div className="section__head">
            <h2 className="section__title" id="skills-form-title">
              新增技能
            </h2>
          </div>
          <form className="card" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <TextField
                id="skill-groupId"
                label="所属分组 ID"
                type="number"
                value={form.groupId}
                onChange={(value) => update('groupId', value)}
                error={fieldErrors.groupId}
                required
                disabled={isSaving}
                hint="分组管理接口接入后可在此下拉选择"
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
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving ? '保存中…' : '保存技能'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)} disabled={isSaving}>
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
          <p className="section__note">列表数据将在接口接入后加载</p>
        </div>
        <EmptyState
          title="还没有技能分组"
          description="先新增技能条目并归入分组，前台「技能」区块会按分组顺序展示。"
          action={
            <button type="button" className="btn btn--primary" onClick={() => setShowForm(true)}>
              新增技能
            </button>
          }
        />
      </section>
    </>
  );
}
