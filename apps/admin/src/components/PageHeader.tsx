import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

/** 每个模块页统一的页头：标题（h1）+ 说明 + 操作区，保证页面不是「只有一句 TODO」。 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__desc">{description}</p>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
