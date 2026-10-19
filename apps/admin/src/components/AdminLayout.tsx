import { NavLink, Outlet } from 'react-router-dom';

/** 侧边栏导航项：与 PRD 站点地图的七个后台路由一一对应。 */
const NAV_ITEMS = [
  { to: '/', label: '概览', end: true },
  { to: '/profile', label: '个人信息', end: false },
  { to: '/skills', label: '技能', end: false },
  { to: '/projects', label: '项目', end: false },
  { to: '/posts', label: '文章', end: false },
  { to: '/media', label: '图片库', end: false },
  { to: '/settings', label: '站点设置', end: false },
] as const;

/**
 * 后台布局：侧边栏导航 + 内容区（TECH_DESIGN §1.1）。
 * 语义landmark：header / nav / main，并提供「跳到主内容」链接（PRD §5.8）。
 */
export function AdminLayout() {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main">
        跳到主内容
      </a>

      <aside className="admin-sidebar">
        <header className="admin-brand">
          <div className="admin-brand__title">作品集后台</div>
          <p className="admin-brand__note">内容管理 · 深色模式</p>
        </header>

        <nav className="admin-nav" aria-label="后台主导航">
          <ul className="admin-nav__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main id="admin-main" className="admin-main" tabIndex={-1}>
        <div className="admin-main__inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
