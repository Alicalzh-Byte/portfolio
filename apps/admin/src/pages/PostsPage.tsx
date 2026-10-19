import { postInputSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { FormFeedback } from '../components/FormFeedback';
import { SelectField, TextAreaField, TextField } from '../components/FormField';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
] as const;

type PostForm = {
  title: string;
  slug: string;
  summary: string;
  status: string;
  contentMd: string;
};

const INITIAL_FORM: PostForm = {
  title: '',
  slug: '',
  summary: '',
  status: 'draft',
  contentMd: '',
};

/**
 * 文章页（F4）：列表壳（空状态）+ 文章编辑器脚手架。
 * 编辑器内置 Markdown 源码与实时预览，预览复用 `@portfolio/shared/markdown` 的唯一渲染实现。
 */
export function PostsPage() {
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<PostForm>(INITIAL_FORM);
  const { status, message, fieldErrors, isSaving, run, reset } = useSubmitState();

  function update<K extends keyof PostForm>(key: K, value: PostForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await run(async () => {
      const parsed = postInputSchema.safeParse({
        slug: form.slug,
        title: form.title,
        summary: form.summary.trim() || null,
        contentMd: form.contentMd,
        status: form.status,
        tagNames: [],
      });

      if (!parsed.success) {
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          message: '请检查表单填写',
          fields: toFieldErrors(parsed.error),
        });
      }

      await apiClient.post(ADMIN_API.posts, parsed.data);
      return form.status === 'published' ? '文章已发布' : '草稿已保存';
    });

    if (ok) {
      setForm(INITIAL_FORM);
      setShowEditor(false);
      reset();
    }
  }

  return (
    <>
      <PageHeader
        title="文章"
        description="在网页后台撰写 Markdown，写完直接发布。草稿不会出现在公开列表、RSS 与 sitemap 中。"
        actions={
          <button type="button" className="btn btn--ghost" onClick={() => setShowEditor((value) => !value)}>
            {showEditor ? '收起编辑器' : '撰写文章'}
          </button>
        }
      />

      {showEditor ? (
        <section className="section" aria-labelledby="posts-editor-title">
          <div className="section__head">
            <h2 className="section__title" id="posts-editor-title">
              文章编辑器
            </h2>
            <p className="section__note">预览与线上渲染使用同一管线</p>
          </div>
          <form className="card" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <TextField
                id="post-title"
                label="标题"
                value={form.title}
                onChange={(value) => update('title', value)}
                error={fieldErrors.title}
                required
                disabled={isSaving}
              />
              <TextField
                id="post-slug"
                label="URL slug"
                value={form.slug}
                onChange={(value) => update('slug', value)}
                error={fieldErrors.slug}
                required
                disabled={isSaving}
                placeholder="my-first-post"
                hint="中文标题无法自动生成 slug，请手填英文短语"
              />
              <SelectField
                id="post-status"
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
                id="post-summary"
                label="摘要"
                value={form.summary}
                onChange={(value) => update('summary', value)}
                error={fieldErrors.summary}
                disabled={isSaving}
                rows={3}
                placeholder="列表与分享卡片上展示的简短说明"
              />
            </div>

            <MarkdownEditor
              id="post-contentMd"
              label="正文"
              value={form.contentMd}
              onChange={(value) => update('contentMd', value)}
              error={fieldErrors.contentMd}
              disabled={isSaving}
              placeholder={'# 标题\n\n正文内容……'}
            />

            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving ? '提交中…' : form.status === 'published' ? '发布文章' : '保存草稿'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowEditor(false)} disabled={isSaving}>
                取消
              </button>
              <FormFeedback status={status} message={message} />
            </div>
          </form>
        </section>
      ) : null}

      <section className="section" aria-labelledby="posts-list-title">
        <div className="section__head">
          <h2 className="section__title" id="posts-list-title">
            文章列表
          </h2>
          <p className="section__note">列表数据将在接口接入后加载</p>
        </div>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">文章列表</caption>
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">状态</th>
                <th scope="col">发布于</th>
                <th scope="col">阅读时长</th>
                <th scope="col">浏览</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="还没有文章"
                    description="点击「撰写文章」开始写作，或等待接口接入后自动加载现有文章。"
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
