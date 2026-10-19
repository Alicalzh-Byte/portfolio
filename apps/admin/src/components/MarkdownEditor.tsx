import { estimateReadingMinutes, renderMarkdown } from '@portfolio/shared/markdown';
import { useEffect, useMemo, useState } from 'react';
import { TextAreaField } from './FormField';

type MarkdownEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Markdown 编辑器：左侧源码，右侧实时预览。
 *
 * 预览调用的是 `@portfolio/shared/markdown` 的 `renderMarkdown` —— 与线上渲染**同一个函数**，
 * 这是「预览与线上一致」（PRD AC5.3）的技术保证；不允许在后台另写一套渲染。
 * 该函数是异步的（内含 Shiki 高亮与 rehype-sanitize），因此这里以 Promise 处理，
 * 并用 300ms 防抖避免每次击键都触发高亮。
 *
 * 安全说明：`renderMarkdown` 内部已做 rehype-sanitize 白名单消毒（会剔除 script / on* / javascript:），
 * 因此这里用 dangerouslySetInnerHTML 展示的是**已消毒**的 HTML，是安全的。
 */
export function MarkdownEditor({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  disabled,
}: MarkdownEditorProps) {
  const [html, setHtml] = useState('');
  const [rendering, setRendering] = useState(false);
  const readingMinutes = useMemo(() => estimateReadingMinutes(value), [value]);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);

    const timer = window.setTimeout(() => {
      renderMarkdown(value)
        .then((result) => {
          if (!cancelled) setHtml(result);
        })
        .catch(() => {
          if (!cancelled) setHtml('');
        })
        .finally(() => {
          if (!cancelled) setRendering(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="md-editor">
      <div className="md-editor__pane">
        <TextAreaField
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          error={error}
          placeholder={placeholder}
          disabled={disabled}
          rows={18}
        />
      </div>

      <div className="md-editor__pane">
        <div className="md-editor__head">
          <span id={`${id}-preview-label`}>实时预览</span>
          <span className="md-editor__meta">{rendering ? '渲染中…' : `约 ${readingMinutes} 分钟阅读`}</span>
        </div>
        <div
          className="markdown-preview"
          role="region"
          aria-labelledby={`${id}-preview-label`}
          aria-busy={rendering}
        >
          {html ? (
            <div className="markdown-preview__content" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="markdown-preview__empty">
              开始输入 Markdown，这里将实时预览。标题、列表、表格、代码块与外部链接均与线上渲染一致。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
