import { ADMIN_API } from '@portfolio/shared/api';
import { MAX_UPLOAD_BYTES, detectImageMime } from '@portfolio/shared/schemas';
import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { FormFeedback } from '../components/FormFeedback';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

/**
 * 图片库页（F5 · 媒体库）：上传脚手架 + 网格空状态。
 * 上传前在浏览器侧做两道校验，与后端规则保持一致：
 * - 体积上限 5MB（PRD AC5.4）；
 * - 真实格式按**文件头魔数**判定（`detectImageMime`），不看扩展名——伪造扩展名会被拒。
 */
export function MediaPage() {
  const [file, setFile] = useState<File | null>(null);
  const { status, message, fieldErrors, isSaving, run } = useSubmitState();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await run(async () => {
      if (!file) {
        throw new ApiRequestError({ code: 'VALIDATION_FAILED', message: '请先选择一张图片' });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new ApiRequestError({
          code: 'PAYLOAD_TOO_LARGE',
          message: `单张图片不能超过 ${MAX_MB}MB`,
        });
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = detectImageMime(bytes);
      if (!mime) {
        throw new ApiRequestError({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: '仅支持 JPEG / PNG / WebP / GIF（按文件头判定，改后缀无效）',
        });
      }

      await apiClient.upload(ADMIN_API.media, file);
      return `${file.name} 已上传`;
    });

    if (ok) setFile(null);
  }

  return (
    <>
      <PageHeader
        title="图片库"
        description={`上传与管理站点图片（单张上限 ${MAX_MB}MB，仅接受 JPEG / PNG / WebP / GIF）。删除前会检查引用情况。`}
      />

      <section className="section" aria-labelledby="media-upload-title">
        <div className="section__head">
          <h2 className="section__title" id="media-upload-title">
            上传图片
          </h2>
        </div>
        <form className="card" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="media-file">
              选择图片文件
            </label>
            <input
              id="media-file"
              className={fieldErrors.file ? 'input input--error' : 'input'}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              aria-invalid={fieldErrors.file ? true : undefined}
              disabled={isSaving}
            />
            <p className="field__hint">{file ? `已选择：${file.name}` : '支持多选待接入；当前一次上传一张'}</p>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={isSaving || !file}>
              {isSaving ? '上传中…' : '上传'}
            </button>
            <FormFeedback status={status} message={message} />
          </div>
        </form>
      </section>

      <section className="section" aria-labelledby="media-list-title">
        <div className="section__head">
          <h2 className="section__title" id="media-list-title">
            全部图片
          </h2>
          <p className="section__note">接口接入后将显示总体积与引用状态</p>
        </div>
        <EmptyState
          title="图片库为空"
          description="上传的图片会存入 R2，这里展示缩略图、体积与引用它的内容。"
        />
      </section>
    </>
  );
}
