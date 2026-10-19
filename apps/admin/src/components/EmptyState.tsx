import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

/** 列表空状态：每个列表都必须有空状态，不出现空白区域（PRD §5.6）。 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__desc">{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
