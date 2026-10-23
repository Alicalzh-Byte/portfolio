import { profileUpdateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { Profile, SocialLink } from '@portfolio/shared/types';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
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
  // 头像、简历、社交链接与隐藏字段不在表单里直接编辑，但保存时必须原样带回，
  // 否则一次保存就会把它们清空。
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const profile = await apiClient.get<Profile | null>(ADMIN_API.profile);
        if (cancelled || !profile) return;
        setForm({
          displayName: profile.displayName,
          headline: profile.headline ?? '',
          location: profile.location ?? '',
          status: profile.status ?? '',
          email: profile.email ?? '',
          aboutMd: profile.aboutMd ?? '',
        });
        setAvatarKey(profile.avatarKey);
        setResumeKey(profile.resumeKey);
        setSocialLinks(profile.socialLinks);
        setHiddenFields(profile.hiddenFields);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiRequestError ? error.message : '读取个人信息失败，请刷新重试。',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
        socialLinks,
        hiddenFields,
        avatarKey,
        resumeKey,
      });

      if (!parsed.success) {
        const fields = toFieldErrors(parsed.error);
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          // 有些字段（如社交链接）不在表单里，把第一条具体原因直接显示出来，
          // 避免只剩一句「请检查表单填写」找不到问题。
          message: Object.values(fields)[0] ?? '请检查表单填写',
          fields,
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
        {loading && <p className="muted">正在读取个人信息…</p>}
        {loadError && <p className="muted">{loadError}</p>}
        <div className="form-grid">
          <TextField
            id="profile-displayName"
            label="姓名"
            value={form.displayName}
            onChange={(value) => update('displayName', value)}
            error={fieldErrors.displayName}
            required
            disabled={isSaving || loading}
            autoComplete="name"
          />
          <TextField
            id="profile-headline"
            label="一句话简介"
            value={form.headline}
            onChange={(value) => update('headline', value)}
            error={fieldErrors.headline}
            disabled={isSaving || loading}
            hint="展示在姓名下方，建议 30 字以内"
          />
          <TextField
            id="profile-location"
            label="所在地"
            value={form.location}
            onChange={(value) => update('location', value)}
            error={fieldErrors.location}
            disabled={isSaving || loading}
          />
          <TextField
            id="profile-status"
            label="当前状态"
            value={form.status}
            onChange={(value) => update('status', value)}
            error={fieldErrors.status}
            disabled={isSaving || loading}
            hint="例如：可接受合作 / 正在求职"
          />
          <TextField
            id="profile-email"
            label="联系邮箱"
            type="email"
            value={form.email}
            onChange={(value) => update('email', value)}
            error={fieldErrors.email}
            disabled={isSaving || loading}
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
            disabled={isSaving || loading}
            rows={8}
            placeholder="支持 Markdown 语法，线上将用同一渲染管线输出。"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSaving || loading}>
            {isSaving ? '保存中…' : '保存'}
          </button>
          <FormFeedback status={status} message={message} />
        </div>
      </form>
    </>
  );
}
