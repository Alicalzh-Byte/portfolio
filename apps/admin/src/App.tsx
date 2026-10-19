import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { MediaPage } from './pages/MediaPage';
import { OverviewPage } from './pages/OverviewPage';
import { PostsPage } from './pages/PostsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SkillsPage } from './pages/SkillsPage';

/**
 * 后台 SPA 的路由（对应 PRD 站点地图 /admin/*）。
 * `basename` 与 Vite `base` 一致：浏览器访问 /admin/profile，路由内匹配到 /profile。
 */
const BASENAME = '/admin';

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        {/* 布局路由：侧边栏 + 内容区，子路由渲染进 <Outlet /> */}
        <Route element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="posts" element={<PostsPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
