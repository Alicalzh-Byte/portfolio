-- ============================================================================
-- 0002_indexes.sql · 索引（对齐 TECH_DESIGN §3.4）
--
-- 一次建齐：D1 的查询延迟对「是否走索引」很敏感，而列表页是访问最频繁的路径。
-- slug 的唯一索引已由 UNIQUE 约束隐式创建，这里不再重复建。
-- ============================================================================

-- 文章列表主查询：已发布 + 时间倒序（草稿被 WHERE 过滤掉，但复合索引仍以 status 打头）
CREATE INDEX idx_posts_status_published_at ON posts (status, published_at DESC);

-- 首页精选：featured = 1 且按手动排序取值
CREATE INDEX idx_projects_featured_sort ON projects (featured, sort_order);

-- 技能按分组排序取值
CREATE INDEX idx_skills_group_sort ON skills (group_id, sort_order);
CREATE INDEX idx_skill_groups_sort ON skill_groups (sort_order);

-- 连接表的「反方向」索引：按标签筛选文章/项目，以及标签聚合页统计
CREATE INDEX idx_post_tags_tag ON post_tags (tag_id);
CREATE INDEX idx_project_tags_tag ON project_tags (tag_id);

-- 媒体库按上传时间倒序浏览
CREATE INDEX idx_media_created_at ON media (created_at DESC);

-- 留言后台列表：按状态与时间
CREATE INDEX idx_messages_status_created ON messages (status, created_at DESC);

-- 频率限制：按 ip_hash + 时间窗口查询近期提交次数
CREATE INDEX idx_messages_ip_hash_created ON messages (ip_hash, created_at DESC);

-- 回滚快照按实体定位
CREATE INDEX idx_content_revisions_entity ON content_revisions (entity_type, entity_id, created_at DESC);

-- 关于页时间线排序
CREATE INDEX idx_timeline_items_sort ON timeline_items (sort_order);
