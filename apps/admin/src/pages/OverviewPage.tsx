import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

/** 概览页：把六个内容模块作为入口卡片列出，让后台首页不是空壳。 */
const MODULES = [
  { to: '/profile', title: '个人信息', desc: '姓名、简介、头像、社交链接与简历文件' },
  { to: '/skills', title: '技能', desc: '技能分组、条目的熟练度与排序' },
  { to: '/projects', title: '项目', desc: '项目详情、封面、标签与首页精选标记' },
  { to: '/posts', title: '文章', desc: 'Markdown 撰写、草稿与发布' },
  { to: '/media', title: '图片库', desc: '上传图片、查看引用与清理大图' },
  { to: '/settings', title: '站点设置', desc: '站点标题、分享图、强调色与页脚文案' },
] as const;

export function OverviewPage() {
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
          {MODULES.map((item) => (
            <li key={item.to}>
              <Link className="module-card" to={item.to}>
                <h3 className="module-card__title">{item.title}</h3>
                <p className="module-card__desc">{item.desc}</p>
              </Link>
            </li>
          ))}
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
            本页为后台骨架：路由、布局与表单框架已就绪，数据读写统一经
            {' '}
            <span className="badge">/api/admin/*</span>
            {' '}
            接口完成，并带 Access 边缘鉴权与应用内二次校验。列表数据与统计将在接口接入后自动填充。
          </p>
        </div>
      </section>
    </>
  );
}
