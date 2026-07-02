# EasyWork

个人效率工具，适配 Windows 和 Android 双端。以统一入口解决日常办公与生活中的常用工具需求。

## 功能模块

| 模块 | 说明 |
|---|---|
| Dashboard | 固定卡片聚合：今日待办、未读邮件、预算、笔记、运动、股票 |
| 任务看板 | 看板/列表/日历三视图，拖拽排序，周期任务(RRULE) |
| 日历 | 月/周/日视图，农历+中国节假日，任务标记 |
| 邮箱 | 多账户IMAP，联系人CRUD+VCF，签名，邮件→任务联动 |
| 笔记 | 富文本编辑(flutter_quill)，FTS5搜索，标签 |
| 记账 | 收支记录，分类管理，预算，月度报表 |
| 股票 | 自选股，新浪财经API实时行情 |
| 运动记录 | 手动记录，预留第三方同步接口 |
| Timeline | 跨模块事件时间线 |
| 日志 | 全量审计底表，筛选+导出 |

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Flutter + Dart 最新稳定版 |
| 状态管理 | Riverpod |
| 本地存储 | drift (SQLite) |
| 路由 | go_router |
| 邮件协议 | enough_mail |
| 富文本编辑 | flutter_quill |
| 图表 | fl_chart |
| 国际化 | Flutter intl / ARB (中/英) |

## 架构

- **Clean Architecture + Feature-first 分包**：domain → data → presentation
- **Repository 模式**：domain 层抽象接口，data 层实现
- **EventBus 解耦**：模块间通过类型安全事件通信
- **Riverpod 状态管理**：Provider/NotifierProvider/FutureProvider
- **FTS5 全文搜索**：任务、邮件、联系人、笔记

## 目录结构

```
lib/
├── core/                  # 基础设施(主题/路由/数据库/错误处理/安全)
├── l10n/                  # 国际化 ARB 文件
├── shared/                # 跨模块共用(组件/模型/事件)
├── features/              # 功能模块
│   ├── dashboard/
│   ├── timeline/
│   ├── task_board/
│   ├── calendar/
│   ├── email/
│   ├── notes/
│   ├── accounting/
│   ├── stocks/
│   ├── exercise/
│   ├── log/
│   └── settings/
├── main.dart
└── app.dart
```

## 平台特性

| 特性 | Windows | Android |
|---|---|---|
| 系统托盘 | ✅ | - |
| 窗口管理 | ✅ | - |
| 开机自启 | ✅ | ✅ |
| 后台收信 | ✅ | ✅ (WorkManager) |
| Deep Link | - | ✅ |
| Share Intent | - | ✅ |
| App Shortcuts | - | ✅ |

## 开发路线

- **Phase 0**：项目脚手架(主题/路由/DB/EventBus/i18n)
- **Phase 1**：UI骨架+导航
- **Phase 2**：邮箱模块
- **Phase 3**：任务看板
- **Phase 4**：Dashboard+Timeline
- **Phase 5**：日历
- **Phase 6**：笔记+记账
- **Phase 7**：日志+设置+备份+Windows托盘
- **Phase 8**：扩展模块(股票/日历同步/运动同步)

## 快速开始

```bash
# 安装依赖
flutter pub get

# 运行
flutter run

# 测试
flutter test

# 构建
flutter build apk    # Android
flutter build windows # Windows
```
