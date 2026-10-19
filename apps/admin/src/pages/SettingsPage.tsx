import { settingsUpdateSchema, toFieldErrors } from '@portfolio/shared/schemas';
import { ADMIN_API } from '@portfolio/shared/api';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { FormFeedback } from '../components/FormFeedback';
import { TextField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

type SettingsForm = {
  siteTitle: string;
  siteSubtitle: string;
  accentColor: string;
  footerText: string;
};

const INITIAL_FORM: SettingsForm = {
  siteTitle: '',
  siteSubtitle: '',
  accentColor: '',
  footerText: '',
};

/** 站点设置页（F5）：站点级配置表单，复用 `settingsUpdateSchema` 校验。 */
export function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(INITIAL_FORM);
  const { status, message, fieldErrors, isSaving, run } = useSubmitState();

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      const parsed = settingsUpdateSchema.safeParse({
        siteTitle: form.siteTitle,
        siteSubtitle: form.siteSubtitle,
        accentColor: form.accentColor.trim() || null,
        footerText: form.footerText,
      });

      if (!parsed.success) {
        throw new ApiRequestError({
          code: 'VALIDATION_FAILED',
          message: '请检查表单填写',
          fields: toFieldErrors(parsed.error),
        });
      }

      await apiClient.put(ADMIN_API.settings, parsed.data);
      return '站点设置已保存';
    });
  }

  return (
    <>
      <PageHeader
        title="站点设置"
        description="站点标题、默认分享图、主题强调色与页脚文案。保存后写入 settings 表并触发缓存版本号更新。"
      />

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <TextField
            id="settings-siteTitle"
            label="站点标题"
            value={form.siteTitle}
            onChange={(value) => update('siteTitle', value)}
            error={fieldErrors.siteTitle}
            required
            disabled={isSaving}
          />
          <TextField
            id="settings-siteSubtitle"
            label="站点副标题"
            value={form.siteSubtitle}
            onChange={(value) => update('siteSubtitle', value)}
            error={fieldErrors.siteSubtitle}
            disabled={isSaving}
          />
          <TextField
            id="settings-accentColor"
            label="主题强调色"
            value={form.accentColor}
            onChange={(value) => update('accentColor', value)}
            error={fieldErrors.accentColor}
            disabled={isSaving}
            placeholder="#7c5cff"
            hint="必须是 #RRGGBB 十六进制色值，避免任意 CSS 注入"
          />
          <TextField
            id="settings-footerText"
            label="页脚文案"
            value={form.footerText}
            onChange={(value) => update('footerText', value)}
            error={fieldErrors.footerText}
            disabled={isSaving}
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
