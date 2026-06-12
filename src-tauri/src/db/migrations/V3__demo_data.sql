-- ============================================
-- V3__demo_data.sql — Demo 数据（UI 展示用）
-- ============================================

-- ---------- tasks: 8 条 ----------
INSERT INTO tasks (title, description, status, priority, urgency, difficulty, assignee, due_time) VALUES
    ('完成项目架构设计', '设计整体技术方案和数据库结构', 'todo', 'high', 'high', 'medium', '', datetime('now', '+3 days')),
    ('编写 API 文档', '为后端接口编写 Swagger 文档', 'todo', 'medium', 'medium', 'low', '', datetime('now', '+7 days')),
    ('修复登录页 Bug', '用户反馈的验证码不显示问题', 'doing', 'high', 'high', 'low', '张三', datetime('now', '+1 days')),
    ('优化首页加载速度', '首屏渲染时间控制在 2s 以内', 'doing', 'medium', 'medium', 'hard', '李四', datetime('now', '+5 days')),
    ('完成单元测试覆盖', '核心模块测试覆盖率需达 80%', 'done', 'medium', 'low', 'medium', '王五', datetime('now', '-2 days')),
    ('部署 staging 环境', '配置 CI/CD 流水线并部署到预发布环境', 'done', 'high', 'medium', 'medium', '', datetime('now', '-5 days')),
    ('旧版数据迁移脚本', '从 MySQL 迁移历史数据到 SQLite', 'abandoned', 'low', 'low', 'hard', '', datetime('now', '-10 days')),
    ('重构认证模块', '统一 OAuth2 认证流程', 'abandoned', 'medium', 'low', 'hard', '', datetime('now', '-15 days'));

UPDATE tasks SET completed_at = datetime('now', '-2 days') WHERE status = 'done' AND id = 5;
UPDATE tasks SET completed_at = datetime('now', '-5 days') WHERE status = 'done' AND id = 6;

-- ---------- transactions: 10 条 ----------
INSERT INTO transactions (id, type, amount, category, subcategory, note, date) VALUES
    (1, 'expense', -28.50, '餐饮', '早餐', '公司楼下便利店', datetime('now', '-6 days')),
    (2, 'expense', -45.00, '交通', '地铁', '通勤地铁充值', datetime('now', '-6 days')),
    (3, 'expense', -199.00, '购物', '数码', 'USB-C 数据线 x2', datetime('now', '-5 days')),
    (4, 'expense', -32.00, '餐饮', '午餐', '和同事拼单外卖', datetime('now', '-5 days')),
    (5, 'income', 15000.00, '工资', '月薪', '6 月工资到账', datetime('now', '-4 days')),
    (6, 'expense', -88.00, '娱乐', '电影', '周末观影 + 爆米花饮料', datetime('now', '-4 days')),
    (7, 'expense', -15.50, '交通', '打车', '加班回家打车', datetime('now', '-3 days')),
    (8, 'expense', -256.00, '购物', '日用品', '洗衣液 + 纸巾 + 垃圾袋', datetime('now', '-2 days')),
    (9, 'expense', -42.00, '餐饮', '晚餐', '朋友聚餐 AA 制', datetime('now', '-1 days')),
    (10, 'expense', -12.00, '餐饮', '咖啡', '星巴克拿铁', datetime('now'));

-- ---------- calendars: 6 条 ----------
INSERT INTO calendars (title, description, start_at, end_at, type, color, is_all_day) VALUES
    ('产品需求评审', 'Q3 产品路线图评审会议', datetime('now', 'start of day'), datetime(datetime('now', 'start of day'), '+2 hours'), 'meeting', '#FF6B6B', 0),
    ('团队周会', '每周例行站会', datetime('now', '+1 day', '10:00'), datetime('now', '+1 day', '11:00'), 'meeting', '#4ECDC4', 0),
    ('项目截止日', 'V1.0 版本发布 deadline', datetime('now', '+5 days', 'start of day'), datetime('now', '+6 days', 'start of day'), 'deadline', '#FF8C42', 1),
    ('技术分享会', 'Rust 异步编程实践', datetime('now', '+3 day', '14:30'), datetime('now', '+3 day', '16:30'), 'event', '#A78BFA', 0),
    ('年度体检', '公司安排的年度健康检查', datetime('now', '+10 days', '08:00'), datetime('now', '+10 days', '12:00'), 'personal', '#34D399', 0),
    ('端午假期', '端午节放假三天', datetime('now', '+14 days', 'start of day'), datetime('now', '+17 days', 'start of day'), 'holiday', '#60A5FA', 1);

-- ---------- mail_accounts: 5 条 ----------
INSERT INTO mail_accounts (email, username, imap_host, imap_port, smtp_host, smtp_port, sync_period, sync_interval) VALUES
    ('zhangsan@example.com', '张三', 'imap.example.com', 993, 'smtp.example.com', 465, 30, 15),
    ('lisi@company.cn', '李四', 'imap.company.cn', 993, 'smtp.company.cn', 465, 30, 15),
    ('work@example.com', '工作邮箱', 'mail.example.com', 993, 'mail.example.com', 587, 90, 30),
    ('subscribe@news.io', '订阅邮箱', 'imap.news.io', 993, 'smtp.news.io', 465, 7, 60),
    ('personal@gmail.com', '个人邮箱', 'imap.gmail.com', 993, 'smtp.gmail.com', 587, 365, 120);

-- ---------- mail_messages: 12 条 ----------
INSERT INTO mail_messages (account_id, uid, subject, sender, recipients, folder, is_read, is_starred, received_date) VALUES
    (1, 1001, '欢迎加入 EasyWork 团队！', 'hr@example.com', 'zhangsan@example.com', 'INBOX', 1, 1, datetime('now', '-7 days')),
    (1, 1002, '本周待办事项提醒', 'bot@easywork.internal', 'zhangsan@example.com', 'INBOX', 1, 0, datetime('now', '-5 days')),
    (1, 1003, '项目进度报告 - 第 23 周', 'pm@company.cn', 'zhangsan@example.com', 'INBOX', 0, 1, datetime('now', '-3 days')),
    (1, 1004, '代码审查请求: feat/auth-refactor', 'lisi@company.cn', 'zhangsan@example.com', 'INBOX', 0, 0, datetime('now', '-2 days')),
    (1, 1005, '[外部] 合作方案洽谈', 'partner@vendor.com', 'zhangsan@example.com', 'INBOX', 0, 0, datetime('now', '-1 days')),
    (1, 1006, '服务器维护通知', 'ops@company.cn', 'all@company.cn', 'INBOX', 1, 0, datetime('now')),
    (2, 2001, '会议纪要: Q3 规划讨论', 'pm@company.cn', 'lisi@company.cn', 'INBOX', 1, 0, datetime('now', '-6 days')),
    (2, 2002, '设计稿已更新 - V2.3', 'design@company.cn', 'lisi@company.cn', 'INBOX', 0, 1, datetime('now', '-4 days')),
    (2, 2003, 'Re: API 接口对接确认', 'dev@partner.com', 'lisi@company.cn', 'INBOX', 0, 0, datetime('now', '-3 days')),
    (2, 2004, '您的周报尚未提交', 'bot@oa.company.cn', 'lisi@company.cn', 'INBOX', 1, 0, datetime('now', '-2 days')),
    (2, 2005, '发票已寄出', 'finance@company.cn', 'lisi@company.cn', 'INBOX', 0, 0, datetime('now', '-1 days')),
    (2, 2006, '安全培训通知', 'security@company.cn', 'all@company.cn', 'INBOX', 0, 0, datetime('now'));

-- ---------- contacts: 6 条 ----------
INSERT INTO contacts (name, email, phone, group_id) VALUES
    ('张三', 'zhangsan@example.com', '13800138001', 1),
    ('李四', 'lisi@company.cn', '13800138002', 1),
    ('王五', 'wangwu@example.com', '13800138003', 1),
    ('赵六', 'zhaoliu@gmail.com', '13800138004', 2),
    ('产品经理-陈', 'chenpm@company.cn', '13800138005', 1),
    ('设计师-林', 'lindesign@company.cn', '13800138006', 1);

-- ---------- note_folders: 3 条 ----------
INSERT INTO note_folders (name, parent_id) VALUES
    ('工作笔记', NULL),
    ('个人收藏', NULL),
    ('临时备忘', NULL);

-- ---------- notes: 8 条 ----------
INSERT INTO notes (title, content, folder_id, tags) VALUES
    ('Tauri 开发笔记', 'Tauri 2.0 使用 Rust 后端，前端支持 Vue/React/Svelte。状态管理通过 tauri::State 实现。', 1, '["rust","tauri"]'),
    ('SQLite 最佳实践', '桌面应用推荐使用 WAL 模式提升并发性能。记得设置 PRAGMA foreign_keys=ON。', 1, '["sqlite","database"]'),
    ('本周会议纪要', '1. 确定 V1.0 发布时间线\n2. 分配各模块负责人\n3. 评审通过新功能提案', 1, '["meeting"]'),
    ('读书清单', '《代码整洁之道》《系统设计面试》《Rust 编程思想》', 2, '["reading"]'),
    ('旅行计划', '暑假去云南：大理 -> 丽江 -> 香格里拉，预算 8000 元', 2, '["travel"]'),
    ('密码备忘', 'WiFi: EasyWork_Guest_2026\n开发机: 已配置 SSH 免密登录', 3, '["password"]'),
    ('购物清单', '1. 机械键盘\n2. 显示器支架\n3. USB Hub\n4. 笔记本内胆包', 3, '["shopping"]'),
    ('API 设计规范', 'RESTful 风格，使用 HTTP 状态码，分页使用 cursor 方式', 1, '["api","design"]');

-- ---------- stocks: 5 条 ----------
INSERT INTO stocks (code, name, alert_type, target_price, is_enabled) VALUES
    ('000001', '平安银行', 'price_above', 13.50, 1),
    ('600036', '招商银行', 'price_below', 35.00, 1),
    ('000858', '五粮液', 'pct_change_up', 5.0, 1),
    ('600519', '贵州茅台', 'price_below', 1600.00, 1),
    ('300750', '宁德时代', 'price_above', 220.00, 1);

-- ---------- sports_records: 6 条 ----------
INSERT INTO sports_records (type, duration, distance, calories, date, note) VALUES
    ('跑步', 35, 5.2, 320, datetime('now', '-6 days'), '晨跑，天气不错'),
    ('健身', 60, NULL, 280, datetime('now', '-5 days'), '上肢力量训练'),
    ('骑行', 45, 12.5, 210, datetime('now', '-4 days'), '公园绿道骑行'),
    ('跑步', 30, 4.8, 290, datetime('now', '-3 days'), '夜跑，配速 6''15"'),
    ('健身', 45, NULL, 220, datetime('now', '-2 days'), '核心训练 + 拉伸'),
    ('游泳', 40, 1.5, 350, datetime('now', '-1 days'), '自由泳 30 圈');

-- ---------- settings: 默认设置 ----------
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('theme', 'light'),
    ('language', 'zh-CN'),
    ('sidebar_collapsed', 'false'),
    ('default_task_view', 'kanban'),
    ('currency', 'CNY'),
    ('sync_enabled', 'true');

-- ---------- logs: 15 条 ----------
INSERT INTO logs (level, module, message, created_at) VALUES
    ('DEBUG', 'app', '应用启动中...', datetime('now', '-7 days')),
    ('INFO', 'app', 'EasyWork v1.0.0 启动成功', datetime('now', '-7 days')),
    ('INFO', 'db', '数据库连接建立成功', datetime('now', '-7 days')),
    ('DEBUG', 'db', '执行迁移 V1__initial', datetime('now', '-7 days')),
    ('DEBUG', 'db', '执行迁移 V2__indexes', datetime('now', '-7 days')),
    ('DEBUG', 'db', '执行迁移 V3__demo_data', datetime('now', '-7 days')),
    ('INFO', 'db', '数据库初始化完成，共应用 3 个迁移', datetime('now', '-7 days')),
    ('WARN', 'mail', '账户 zhangsan@example.com IMAP 连接超时，将在 30s 后重试', datetime('now', '-5 days')),
    ('ERROR', 'mail', '账户 subscribe@news.io 认证失败: Invalid credentials', datetime('now', '-5 days')),
    ('INFO', 'sync', '邮件同步完成: 新增 3 封，更新 5 封', datetime('now', '-4 days')),
    ('DEBUG', 'stock', '刷新股票行情: 000001 当前价 12.85', datetime('now', '-3 days')),
    ('WARN', 'stock', '股票 600519 价格跌破预警阈值 1650.00', datetime('now', '-2 days')),
    ('INFO', 'task', '任务 #3 状态变更: todo → doing', datetime('now', '-2 days')),
    ('INFO', 'task', '任务 #5 标记为已完成', datetime('now', '-2 days')),
    ('INFO', 'app', '应用正常关闭', datetime('now'));
