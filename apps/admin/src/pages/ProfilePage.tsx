import { profileUpdateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { FormFeedback } from '../components/FormFeedback';
import { TextAreaField, TextField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

type ProfileForm = {
  displayName: string;
  headline: string;
  location: string;
  status: string;
  email: string;
  aboutMd: string;
};

const INITIAL_FORM: ProfileForm = {
  displayName: '',
  headline: '',
  location: '',
  status: '',
  email: '',
  aboutMd: '',
};

/**
 * 个人信息页（F1）：真实表单 + 保存三态。
 * 提交前先用共享 schema 做客户端校验，字段级错误直接落到对应输入框，
 * 再调用 `PUT /api/admin/profile`；失败时保留用户输入（表单值始终由本组件 state 持有）。
 */
export function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(INITIAL_FORM);
  const { status, message, fieldErrors, isSaving, run } = useSubmitState();

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const parsed = profileUpdateSchema.safeParse({
        displayName: form.displayName,
        headline: form.headline.trim() || null,
        aboutMd: form.aboutMd.trim() || null,
        location: form.location.trim() || null,
        status: form.status.trim() || null,
        email: form.email.trim() || null,
        socialLinks: [],
        hiddenFields: [],
      });

      if (!parsed.success) {
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          message: '请检查表单填写',
          fields: toFieldErrors(parsed.error),
        });
      }

      await apiClient.put(ADMIN_API.profile, parsed.data);
      return '个人信息已保存，线上将在 60s 内同步';
    });
  }

  return (
    <>
      <PageHeader
        title="个人信息"
        description="首页 Hero 与「关于」页展示的身份信息。不公开的字段请在下方标记为隐藏，服务端读取时会自动剔除。"
      />

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <TextField
            id="profile-displayName"
            label="姓名"
            value={form.displayName}
            onChange={(value) => update('displayName', value)}
            error={fieldErrors.displayName}
            required
            disabled={isSaving}
            autoComplete="name"
          />
          <TextField
            id="profile-headline"
            label="一句话简介"
            value={form.headline}
            onChange={(value) => update('headline', value)}
            error={fieldErrors.headline}
            disabled={isSaving}
            hint="展示在姓名下方，建议 30 字以内"
          />
          <TextField
            id="profile-location"
            label="所在地"
            value={form.location}
            onChange={(value) => update('location', value)}
            error={fieldErrors.location}
            disabled={isSaving}
          />
          <TextField
            id="profile-status"
            label="当前状态"
            value={form.status}
            onChange={(value) => update('status', value)}
            error={fieldErrors.status}
            disabled={isSaving}
            hint="例如：可接受合作 / 正在求职"
          />
          <TextField
            id="profile-email"
            label="联系邮箱"
            type="email"
            value={form.email}
            onChange={(value) => update('email', value)}
            error={fieldErrors.email}
            disabled={isSaving}
            autoComplete="email"
          />
        </div>

        <div className="form-grid form-grid--single">
          <TextAreaField
            id="profile-aboutMd"
            label="关于我（Markdown）"
            value={form.aboutMd}
            onChange={(value) => update('aboutMd', value)}
            error={fieldErrors.aboutMd}
            disabled={isSaving}
            rows={8}
            placeholder="支持 Markdown 语法，线上将用同一渲染管线输出。"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? '保存中…' : '保存'}
          </button>
          <FormFeedback status={status} message={message} />
        </div>
      </form>
    </>
  );
}
