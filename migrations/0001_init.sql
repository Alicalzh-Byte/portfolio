-- ============================================================================
-- 0001_init.sql · 初始建表（对齐 TECH_DESIGN §3.3）
--
-- 约定：
--   1. 所有时间列存 UTC ISO 8601 字符串（strftime 输出带 T 与 Z），展示层再转本地时区。
--   2. 库内字段用 snake_case；TS 侧映射为 camelCase（packages/shared/src/types.ts）。
--   3. 图片与内容表之间不做外键，只用 R2 object key 弱引用（见 TECH_DESIGN §3.2）。
--   4. 每个写操作成功后必须自增 settings.content_version（见 0002 之后的仓库层实现）。
--
-- ⚠️ 本文件一旦在某个环境应用过就**不得再修改**，结构变更一律新增迁移文件。
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- profile · 个人信息（单行表，用 CHECK 强制只能有一行）
-- ---------------------------------------------------------------------------
CREATE TABLE profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  display_name  TEXT    NOT NULL,
  headline      TEXT,
  about_md      TEXT,
  avatar_key    TEXT,
  location      TEXT,
  status        TEXT,
  email         TEXT,
  resume_key    TEXT,
  -- JSON 数组：[{ label, url, icon? }]
  social_links  TEXT    NOT NULL DEFAULT '[]',
  -- JSON 数组：不对外公开的字段名（PRD AC1.2）
  hidden_fields TEXT    NOT NULL DEFAULT '[]',
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- 技能：分组 + 技能项（F2）
-- ---------------------------------------------------------------------------
CREATE TABLE skill_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE skills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES skill_groups (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  icon        TEXT,
  -- 1~5 档，可空；为空时前端不渲染进度条（PRD AC2.2）
  level       INTEGER CHECK (level IS NULL OR (level BETWEEN 1 AND 5)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- 项目（F3）
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL,
  summary      TEXT,
  content_md   TEXT,
  cover_key    TEXT,
  repo_url     TEXT,
  demo_url     TEXT,
  status       TEXT    NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'archived')),
  -- 首页精选标记，最多展示 6 个（PRD AC3.1）
  featured     INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  started_at   TEXT,
  ended_at     TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- 文章（F4）
-- ---------------------------------------------------------------------------
CREATE TABLE posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  summary         TEXT,
  -- 存 Markdown 原文：渲染在读取时进行，保证后台能继续编辑
  content_md      TEXT    NOT NULL DEFAULT '',
  cover_key       TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published')),
  -- 首次发布时间的快照；草稿为空。发布后再次编辑不改动它（PRD AC4.1）
  published_at    TEXT,
  -- 由正文词数估算后缓存（AC4.3）
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  -- 站内自统计，不使用第三方埋点
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- 标签：文章与项目共用一张表，各自通过连接表关联（统一标签聚合页）
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE,
  slug TEXT    NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE project_tags (
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- media · 已上传资源索引（真实文件在 R2）
-- ---------------------------------------------------------------------------
CREATE TABLE media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- R2 object key，规则：{yyyy}/{mm}/{uuid}.{ext}
  key           TEXT    NOT NULL UNIQUE,
  -- 由文件头魔数判定，不看扩展名（AC5.4）
  mime          TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  -- 用于前端预留宽高比，消除布局跳动（CLS）
  width         INTEGER,
  height        INTEGER,
  original_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- settings · 站点级键值配置（连文案也入库，保证后台可改、改后不改代码）
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  -- JSON 编码的值：字符串要带引号，数字直接写数字
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- messages · 留言（F6）
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled', 'spam')),
  -- 只存哈希，不存明文 IP：用于频率限制，同时满足隐私要求
  ip_hash    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- content_revisions · 变更前快照（破坏性操作可回滚）
-- ---------------------------------------------------------------------------
CREATE TABLE content_revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT    NOT NULL
                      CHECK (entity_type IN ('profile', 'project', 'post', 'settings', 'skill_group', 'timeline')),
  entity_id   INTEGER NOT NULL,
  -- 变更前实体的 JSON 快照
  snapshot    TEXT    NOT NULL,
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- timeline_items · 关于页「经历时间线」
-- 内容同样必须来自 D1（AGENTS.md 最高优先级约束 1：不允许硬编码进模板）
-- ---------------------------------------------------------------------------
CREATE TABLE timeline_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  period      TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
