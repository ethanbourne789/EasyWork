# EasyWork（中文）

EasyWork 是一款面向 Windows 与 Android 的个人效率工具，整合任务、邮件、笔记、记账等功能，为日常办公与生活提供统一入口。

快速链接： [English](README.en.md) · [返回顶部](README.zh.md)

功能模块

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

技术栈

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

快速开始

```bash
flutter pub get
flutter run
flutter test
flutter build apk
flutter build windows
```

---

遵循项目许可。
