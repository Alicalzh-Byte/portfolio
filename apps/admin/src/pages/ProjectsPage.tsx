import { projectInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { FormFeedback } from '../components/FormFeedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

const STATUS_OPTIONS = [
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
] as const;

type ProjectForm = {
  slug: string;
  title: string;
  summary: string;
  status: string;
  featured: boolean;
};

const INITIAL_FORM: ProjectForm = {
  slug: '',
  title: '',
  summary: '',
  status: 'active',
  featured: false,
};

/** 项目页（F3）：工具栏 + 表格壳（空状态）+ 新建项目表单脚手架。 */
export function ProjectsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProjectForm>(INITIAL_FORM);
  const { status, message, fieldErrors, isSaving, run, reset } = useSubmitState();

  function update<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await run(async () => {
      const parsed = projectInputSchema.safeParse({
        slug: form.slug,
        title: form.title,
        summary: form.summary.trim() || null,
        status: form.status,
        featured: form.featured,
        tagNames: [],
      });

      if (!parsed.success) {
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          message: '请检查表单填写',
          fields: toFieldErrors(parsed.error),
        });
      }

      await apiClient.post(ADMIN_API.projects, parsed.data);
      return '项目已创建';
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
        title="项目"
        description="维护项目详情、封面、标签与首页精选。归档项目不会出现在首页精选区块。"
        actions={
          <button type="button" className="btn btn--ghost" onClick={() => setShowForm((value) => !value)}>
            {showForm ? '收起表单' : '新建项目'}
          </button>
        }
      />

      {showForm ? (
        <section className="section" aria-labelledby="projects-form-title">
          <div className="section__head">
            <h2 className="section__title" id="projects-form-title">
              新建项目
            </h2>
          </div>
          <form className="card" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <TextField
                id="project-slug"
                label="URL slug"
                value={form.slug}
                onChange={(value) => update('slug', value)}
                error={fieldErrors.slug}
                required
                disabled={isSaving}
                placeholder="my-project"
                hint="小写字母、数字与连字符，用于 /projects/<slug>"
              />
              <TextField
                id="project-title"
                label="标题"
                value={form.title}
                onChange={(value) => update('title', value)}
                error={fieldErrors.title}
                required
                disabled={isSaving}
              />
              <SelectField
                id="project-status"
                label="状态"
                value={form.status}
                onChange={(value) => update('status', value)}
                options={STATUS_OPTIONS}
                error={fieldErrors.status}
                disabled={isSaving}
              />
            </div>
            <div className="form-grid form-grid--single">
              <TextAreaField
                id="project-summary"
                label="摘要"
                value={form.summary}
                onChange={(value) => update('summary', value)}
                error={fieldErrors.summary}
                disabled={isSaving}
                rows={3}
                placeholder="列表卡片上展示的简短说明"
              />
              <CheckboxField
                id="project-featured"
                label="标记为首页精选"
                checked={form.featured}
                onChange={(value) => update('featured', value)}
                disabled={isSaving}
                hint="首页精选最多展示 6 个"
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving ? '保存中…' : '创建项目'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)} disabled={isSaving}>
                取消
              </button>
              <FormFeedback status={status} message={message} />
            </div>
          </form>
        </section>
      ) : null}

      <section className="section" aria-labelledby="projects-list-title">
        <div className="section__head">
          <h2 className="section__title" id="projects-list-title">
            项目列表
          </h2>
          <p className="section__note">列表数据将在接口接入后加载</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">项目列表</caption>
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">slug</th>
                <th scope="col">状态</th>
                <th scope="col">精选</th>
                <th scope="col">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="还没有项目"
                    description="点击右上角「新建项目」添加第一个项目，或等待接口接入后自动加载现有数据。"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
