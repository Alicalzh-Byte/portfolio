import { ADMIN_API } from '@portfolio/shared/api';
import type { Media } from '@portfolio/shared/types';
import { MAX_UPLOAD_BYTES, detectImageMime } from '@portfolio/shared/schemas';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, apiClient } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { FormFeedback } from '../components/FormFeedback';
import { PageHeader } from '../components/PageHeader';
import { useSubmitState } from '../components/useSubmitState';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 图片库页（F5 · 媒体库）：上传 + 真实列表 + 删除。 */
export function MediaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const { status, message, fieldErrors, isSaving, run } = useSubmitState();

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<{ items: Media[] }>(`${ADMIN_API.media}?pageSize=100`);
      setItems(data.items);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof ApiRequestError ? error.message : '读取图片库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

    if (ok) {
      setFile(null);
      await load();
    }
  }

  async function remove(item: Media) {
    const name = item.originalName ?? item.key;
    if (!window.confirm(`确定删除「${name}」？删除前会检查引用它的内容。`)) return;
    try {
      await apiClient.delete(`${ADMIN_API.media}?key=${encodeURIComponent(item.key)}`);
      setActionMessage('图片已删除');
      await load();
    } catch (error) {
      setActionMessage(error instanceof ApiRequestError ? error.message : '删除图片失败');
    }
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
            <p className="field__hint">{file ? `已选择：${file.name}` : '当前一次上传一张'}</p>
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
          <p className="section__note">
            {loading ? '正在读取…' : `共 ${items.length} 张`}
            {items.length > 0
              ? ` · 合计 ${formatSize(items.reduce((sum, item) => sum + item.sizeBytes, 0))}`
              : ''}
          </p>
        </div>

        {loadError ? <p className="muted">{loadError}</p> : null}
        {actionMessage ? <p className="muted">{actionMessage}</p> : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            title="图片库为空"
            description="上传的图片会存进媒体存储，可在此查看缩略图、体积与引用情况。"
          />
        ) : (
          <div className="media-grid">
            {items.map((item) => (
              <figure className="media-item" key={item.id}>
                <img
                  className="media-item__thumb"
                  src={`/media/${item.key}`}
                  alt={item.originalName ?? item.key}
                  loading="lazy"
                />
                <figcaption className="media-item__meta">
                  <span className="media-item__name">{item.originalName ?? item.key}</span>
                  <span className="muted">
                    {formatSize(item.sizeBytes)}
                    {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                  </span>
                  <button type="button" className="btn btn--ghost" onClick={() => void remove(item)}>
                    删除
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
