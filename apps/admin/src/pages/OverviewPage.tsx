import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_API } from '@portfolio/shared/api';
import type { Media, PostSummary, ProjectSummary, SkillGroup } from '@portfolio/shared/types';
import { apiClient } from '../api/client';
import { PageHeader } from '../components/PageHeader';

/** 概览页：模块入口 + 各模块内容数量（数据来自后台接口）。 */
const MODULES = [
  { to: '/profile', title: '个人信息', desc: '姓名、简介、头像、社交链接与简历文件', key: 'profile' },
  { to: '/skills', title: '技能', desc: '技能分组、条目的熟练度与排序', key: 'skills' },
  { to: '/projects', title: '项目', desc: '项目详情、封面、标签与首页精选标记', key: 'projects' },
  { to: '/posts', title: '文章', desc: 'Markdown 撰写、草稿与发布', key: 'posts' },
  { to: '/media', title: '图片库', desc: '上传图片、查看引用与清理大图', key: 'media' },
  { to: '/settings', title: '站点设置', desc: '站点标题、分享图、强调色与页脚文案', key: 'settings' },
] as const;

type Counts = Record<string, number | null>;

export function OverviewPage() {
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [skills, projects, posts, media] = await Promise.all([
          apiClient.get<{ items: SkillGroup[] }>(ADMIN_API.skillGroups),
          apiClient.get<{ items: ProjectSummary[] }>(ADMIN_API.projects),
          apiClient.get<{ items: PostSummary[] }>(ADMIN_API.posts),
          apiClient.get<{ items: Media[] }>(ADMIN_API.media),
        ]);
        if (cancelled) return;
        setCounts({
          skills: skills.items.reduce((sum, group) => sum + group.skills.length, 0),
          projects: projects.items.length,
          posts: posts.items.length,
          media: media.items.length,
        });
      } catch {
        // 401 会由 apiClient 统一跳登录页；其它错误保持占位符
        if (!cancelled) setCounts({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="概览"
        description="在这里统一维护站点的全部内容。所有改动保存后由版本键机制驱动缓存失效，线上最快 60s 内生效。"
      />

      <section className="section" aria-labelledby="overview-modules">
        <div className="section__head">
          <h2 className="section__title" id="overview-modules">
            内容模块
          </h2>
          <p className="section__note">点击卡片进入对应模块</p>
        </div>
        <ul className="module-grid">
          {MODULES.map((item) => {
            const count = counts[item.key];
            return (
              <li key={item.to}>
                <Link className="module-card" to={item.to}>
                  <h3 className="module-card__title">
                    {item.title}
                    {typeof count === 'number' && <span className="badge">{count}</span>}
                  </h3>
                  <p className="module-card__desc">{item.desc}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section" aria-labelledby="overview-status">
        <div className="section__head">
          <h2 className="section__title" id="overview-status">
            运行说明
          </h2>
        </div>
        <div className="card">
          <p className="muted">
            {loading
              ? '正在读取内容数量…'
              : '内容读写统一经 /api/admin/* 完成，保存后自动自增内容版本号。'}
          </p>
        </div>
      </section>
    </>
  );
}
