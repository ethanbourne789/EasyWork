# Supabase CLI 执行报告 — 迁移推送 + 演示数据种子（最终）

> 日期：2026-08-10 ｜ 执行人：Senior Developer
> 目标库：`nbcsywzqvvputqitmpla.supabase.co`（已 `supabase link`，用 PAT 登录 CLI）

## 结论
通过 Supabase CLI（`db push --linked --include-all`）把迁移链 **0001–0018 全部落到远程库**，并端到端验证演示账号可登录且能读到全部种子数据。过程中发现并修复了 **2 个会阻断整个 App 数据读写的隐藏 Bug**。

## 迁移链现状（远程已应用 0001–0018）
| 迁移 | 内容 |
|------|------|
| 0001–0008, 0010 | 既有（账户/分类/交易/预算/邮件凭据/服务角色授权等） |
| 0009 | 整体月度预算 + 跨月滚动（`scope`/`carry_over`/部分唯一索引）|
| 0011 | **演示数据种子**：演示认证用户 + 3 账户 + 17 多级分类 + 18 交易 + 6 预算 |
| 0012–0015 | 排错诊断（创建并填充 `_diag` 表，仅供定位问题，已失效）|
| 0016 | **修复演示账号** 文本列 NULL → 登录 500 |
| 0017 | **补齐 public schema 授权**（修复 42501，关键）|
| 0018 | 清理诊断表 `_diag` |

## 演示账号与种子数据
- **登录账号**：`demo@easywork.app` / `Demo123456!`（真实 Supabase 认证用户，UUID 固定 `11111111-1111-1111-1111-111111111111`）
- 账户：招商银行(bank,12000)、现金钱包(cash,600)、信用卡(credit,-1500)
- 分类：17 个，6 个顶层（餐饮/交通/购物/居住/娱乐/收入），子级含 早午晚餐、地铁/打车、服饰/日用、房租、工资/兼职/理财 等
- 交易：18 笔（2026-08 收/支/转账），金额单位元
- 预算：整体月度上限 8000 + 按分类 餐饮2000/交通600/购物1000/娱乐500/居住4500（202608）

## 执行中修复的 Bug（重要）
1. **`accounts` 表无 `icon` 列** → 种子中移除该列（以 0003 真实 schema 为准）。
2. **`accounts.type` 约束为 `cash/bank/credit`**（非 `card`）→ 信用卡改用 `credit`。
3. **pgcrypto 函数需 `extensions.` 限定**（`gen_salt`/`crypt` 不在迁移角色 search_path）→ 改为 `extensions.crypt(...)`。
4. **演示账号 `auth.users` 文本列 NULL 致登录 500**：直接 INSERT 时 `phone_change`/`recovery_token`/`confirmation_token`/`email_change`/`email_change_token_new` 取了 NULL，而正常注册用户为 `''`；GoTrue 登录触发器对 NULL 做字符串处理抛 `Database error querying schema`(500)。→ 0016 置为 `''` 修复。
5. **🔴 `public` schema 授权缺失（code 42501）**：本项目 `supabase/migrations` 从自定义表(0001)起步，**缺少 Supabase 标准初始化授权**，导致 `authenticated`/`anon` 角色对 `public` 无 USAGE 与表读写权限。**这比之前的“演示模式空壳”更根本——即使真实登录，整个 App 也无法读写任何数据。** → 0017 补齐标准 GRANT（仍由 RLS 保护行级隔离）。

## 端到端验证（已通过）
`scripts/verify-demo.mjs`（用 anon key 以演示账号 `signInWithPassword` 登录后统计）：
```
✅ 演示账号登录成功, user_id = 11111111-1111-1111-1111-111111111111
   accounts=3  categories=17  transactions=18  budgets=6
   overall budget = {scope:'overall', amount:8000, carry_over:0}
   top categories = 餐饮, 交通, 购物, 居住, 娱乐, 收入
```

## 使用方式
- 前端登录页点「以演示账号进入」（走真实 `signInWithPassword`，不再是伪造会话），即可看到上述真实数据。
- 重建/迁移：`supabase db push --linked --include-all`（幂等：种子用 `DELETE`+`INSERT` 按演示用户范围重放）。
- 手工灌库（可选）：`psql` 执行 `supabase/seed.sql`（已改为纯 SQL、字面 UUID、含 `extensions.` 限定）。

## 已知/遗留
- 诊断迁移 `0012–0015` 仍保留在历史中（已应用、仅创建并清理了 `_diag`，无害）；如追求整洁可从本地删除这些文件（注意本地/远程会有漂移，远程已应用不会回滚）。
- `scripts/verify-demo.mjs` 保留为验证工具；临时诊断/失效脚本（`seed-auth-user.mjs`、`diag-read.mjs`、`seed-demo.mjs`）已删除。
