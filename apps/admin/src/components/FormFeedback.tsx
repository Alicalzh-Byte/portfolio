import type { SubmitStatus } from './useSubmitState';

/**
 * 表单反馈：成功用 `role="status"`，失败用 `role="alert"` 让读屏器即时播报（PRD §5.8）。
 */
export function FormFeedback({ status, message }: { status: SubmitStatus; message: string | null }) {
  if (!message || (status !== 'success' && status !== 'error')) return null;

  const isError = status === 'error';
  return (
    <p className={isError ? 'feedback feedback--error' : 'feedback feedback--success'} role={isError ? 'alert' : 'status'}>
      {message}
    </p>
  );
}
