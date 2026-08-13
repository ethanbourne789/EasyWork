# 本机环境配置

### Supabase CLI

- **Path**: `C:\Users\Ethan\bin\supabase\supabase.exe`
- **Description**: Local Supabase CLI service for database migrations, schema management, and local development

---

## Design System（设计系统 · 强制统一准则）

> 本项目的视觉风格、配色、图标、设计令牌（Design Tokens）均以本小节为准。  
> 完整方案见 `design/UI-Redesign-System.md`，可交互原型见 `design/easywork-ui-prototype.html`。  
> **新增任何页面 / 组件时，必须沿用下列令牌与规范，禁止凭空造色、造间距、造图标。**

### 1. 设计理念（Design Principles）


| 原则    | 落地要求                                                     |
| ----- | -------------------------------------------------------- |
| 安静优先  | 中性底色占 ~60%，品牌色仅用于 CTA / 激活态 / 强调（≤10% 面积）                |
| 一眼扫读  | 优先级圆点、未读粗体、金额用 Tabular 数字、状态徽章自带锚点                       |
| 平滑过渡  | 位移/透明度用 ease-out-quart；**必须**尊重 `prefers-reduced-motion` |
| 一致可预期 | 同物同形：所有「新建」用同一主按钮；所有列表行交互一致                              |


### 2. 视觉风格（Visual Foundations）

#### 2.1 色彩系统（OKLCH，感知均匀）

**品牌主色 — Iris 鸢尾靛（色相 264）**，沉静且具辨识度（避开青+深、紫蓝渐变、霓虹等 AI 套路色）：


| Token         | OKLCH（亮）              | OKLCH（暗）              | 用途             |
| ------------- | --------------------- | --------------------- | -------------- |
| `--brand-50`  | `oklch(96% 0.02 264)` | `oklch(24% 0.06 264)` | 选中/悬停底色        |
| `--brand-100` | `oklch(92% 0.04 264)` | `oklch(30% 0.08 264)` | 软强调背景          |
| `--brand-200` | `oklch(84% 0.07 264)` | `oklch(40% 0.11 264)` | 次级强调           |
| `--brand-300` | `oklch(74% 0.11 264)` | `oklch(52% 0.13 264)` | 图标/描边          |
| `--brand-500` | `oklch(56% 0.17 264)` | `oklch(64% 0.15 264)` | **主色 / 主按钮**   |
| `--brand-600` | `oklch(49% 0.16 264)` | `oklch(58% 0.15 264)` | 主色 hover       |
| `--brand-700` | `oklch(42% 0.14 264)` | `oklch(80% 0.13 264)` | 主色 active / 深字 |


**暖调中性（Neutral，色相 70，极弱彩度，比 zinc 更「有人味」）**：


| 语义层     | 亮色 OKLCH                | 暗色 OKLCH               | 对应 CSS 变量                              |
| ------- | ----------------------- | ---------------------- | -------------------------------------- |
| 页面底色    | `oklch(98.5% 0.004 70)` | `oklch(17% 0.008 264)` | `--background`                         |
| 卡片/面板   | `oklch(100% 0.002 70)`  | `oklch(21% 0.01 264)`  | `--card`                               |
| 弹层/抽屉   | `oklch(100% 0.004 70)`  | `oklch(26% 0.012 264)` | `--popover`                            |
| 次级填充    | `oklch(96.5% 0.006 70)` | `oklch(26% 0.012 264)` | `--secondary` / `--muted` / `--accent` |
| 分割线/输入边 | `oklch(92% 0.008 70)`   | `oklch(30% 0.012 264)` | `--border` / `--input`                 |
| 正文      | `oklch(24% 0.01 70)`    | `oklch(95% 0.004 70)`  | `--foreground`                         |
| 次要文字    | `oklch(50% 0.012 70)`   | `oklch(68% 0.02 264)`  | `--muted-foreground`                   |
| 焦点环     | `oklch(56% 0.17 264)`   | `oklch(64% 0.15 264)`  | `--ring`                               |


**语义色（Semantic）**：


| 角色     | 变量              | OKLCH（亮）              | OKLCH（暗）              | 用途                  |
| ------ | --------------- | --------------------- | --------------------- | ------------------- |
| 主色     | `--primary`     | `oklch(56% 0.17 264)` | `oklch(64% 0.15 264)` | 主按钮/激活态             |
| 危险/错误  | `--destructive` | `oklch(58% 0.21 25)`  | `oklch(62% 0.21 25)`  | 删除/失败/支出            |
| 成功/收入  | `--success`     | `oklch(64% 0.15 150)` | `oklch(70% 0.15 150)` | 完成/收入/通过            |
| 警告     | `--warning`     | `oklch(72% 0.15 55)`  | `oklch(78% 0.15 55)`  | 临近截止/超预算            |
| 提示/进行中 | = `--primary`   | —                     | —                     | info 复用主色，**不**另设变量 |


> ⚠️ **实现差异提示**：方案文档曾提议「金色点缀 `--accent`（gold）」，但代码未落地——当前 `--accent` 按 shadcn 惯例是**中性悬停填充**（非金色）。**新增页面请勿使用金色 accent**，除非先在 `src/index.css` 补 token。

**对比度承诺（WCAG AA）**：正文 `≥7:1`、次要文字 `≥4.5:1`、图标/控件 `≥3:1`；颜色**从不作为唯一信息载体**（状态必配图标 + 文字）。

#### 2.2 排版系统（Typography）


| 角色    | 字体                    | 用法                      | 字重                  |
| ----- | --------------------- | ----------------------- | ------------------- |
| 展示/品牌 | **Fraunces**（衬线）      | Logo、页面大标题（h1–h3）、空状态标题 | 500–700             |
| 界面/正文 | **Plus Jakarta Sans** | 全部 UI、正文、按钮             | 400–700             |
| 数据/等宽 | **JetBrains Mono**    | 金额、日期、编号、代码             | 500（`tabular-nums`） |


- 字体经 Google Fonts 在 `src/index.css` 顶部 `@import` 引入，变量为 `--font-ui` / `--font-display` / `--font-mono`（Tailwind 映射为 `font-sans` / `font-display` / `font-mono`）。
- **字号阶梯（固定 rem，数据密集界面不用流式字号）**：xs 12 / sm 14 / base 16 / lg 18 / xl 22 / 2xl 28 / 3xl 36（px）。移动端正文最低 16px。
- `h1–h3` 自动套用 Fraunces + 600 + 字距 `-0.01em`（见 `src/index.css` `@layer base`）。

#### 2.3 间距 / 圆角 / 阴影 / 动效

- **间距（4px 基）**：用 `Tailwind 间距刻度`（1=4 / 2=8 / 3=12 / 4=16 / 6=24 / 8=32 / 12=48 / 16=64）。用间距变化制造节奏，而非万物等距。
- **圆角**：控件 `rounded-md`(10px)、卡片/容器 `rounded-lg`(14px，对应 `--radius`)、大容器 20px、气泡/头像 `rounded-full`。（实现中 `--radius: 0.875rem` = 14px，已映射 `--radius-lg`。）
- **阴影（仅亮色使用；暗色靠表面提亮做层级）**：`--shadow-xs/sm/md/lg` 用极低透明度 OKLCH 黑；抽屉/弹层用 `lg`。
- **动效**：基础过渡 `160ms`、面板 `280ms`、`ease-out-quart` 用于位移；**禁止**动画化 `width/height/top` 等 layout 属性，只用 `transform`/`opacity`；`@media (prefers-reduced-motion: reduce)` 全部降级为瞬时。

### 3. 图标库（Icon Library）

- **唯一图标源：`lucide-react**`（已在 `components.json` 声明 `iconLibrary: "lucide"`，依赖已安装）。
- **规则**：
  - 所有 UI 图标统一从 `lucide-react` 引入，**禁止**混入 emoji、自定义 SVG 或别的图标库。
  - 图标按钮必须 40×40 命中区，且带 `aria-label`（无障碍）。
  - 激活态图标用品牌色（`text-brand-500`/`text-brand-700`）；状态图标必配文字标签。
  - 应用级打包图标（`.icns/.ico/.png` 在仓库根 `icons/`）属于 Tauri 安装产物，**不属于** UI 图标库，不要在界面里引用。

### 4. 设计令牌落地（Developer Reference）

- **令牌即 CSS 变量**，定义在 `src/index.css` 的 `:root` 与 `.dark` 中；亮/暗主题仅切换语义层，原色（primitive）不变。
- **Tailwind v4 映射**：通过 `@theme inline` 把 CSS 变量暴露为工具类，例如：
  - 颜色：`bg-background` `text-foreground` `bg-card` `border-border` `bg-primary text-primary-foreground` `bg-destructive` `text-muted-foreground` `bg-brand-500` `text-brand-700` `bg-success` `bg-warning`
  - 字体：`font-sans` `font-display` `font-mono`
- **组件基类遵循 shadcn/ui（new-york 风格）**：变体用 `class-variance-authority`(cva) + `clsx` + `tailwind-merge`；`cn()` 工具位于 `src/lib/utils.ts`。新增组件优先复用 `src/components/ui/` 现有原子组件，不要重写 button/input/dialog/drawer。
- **禁止硬编码颜色/像素**：任何新样式必须引用上述 token 变量或工具类；不要写 `bg-[#xxx]`、`text-blue-500` 之类的脱离令牌的值。

### 5. 组件规范（Component Specs）


| 组件                    | 规范要点                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Button**            | 变体：primary（品牌实心）/ secondary（描边）/ ghost（纯文字）/ danger；尺寸 sm(32)/md(40)/lg(48)；图标按钮 40×40；focus-visible 2px 品牌环 + 2px 偏移 |
| **Input / Textarea**  | 高 40px、`rounded-md`、sunken 底；focus 边框品牌色 + 柔光环；placeholder 用 `--muted-foreground`                                     |
| **Select / Dropdown** | 触发器同 Input；菜单 `popover` 底 + 阴影；选项 hover 品牌浅底                                                                          |
| **Checkbox / Radio**  | 品牌色填充 + 白勾；≥20px 触控                                                                                                   |
| **Badge / Tag**       | 圆角全/8；状态色用浅底+深字（非纯色块）；优先级圆点 8px                                                                                       |
| **Card**              | `rounded-lg`、`bg-card`、轻阴影；hover 微抬升（仅亮色）                                                                             |
| **Dialog / Drawer**   | 弹层阴影 + 遮罩；抽屉从右滑入（transform）；ESC 关闭、focus trap、滚动锁                                                                     |
| **Tabs**              | 下划线/胶囊；激活品牌色 + 指示条位移动画                                                                                                |
| **Tooltip**           | 延迟 200ms、暗底浅字                                                                                                         |
| **Avatar**            | 圆；无图显示首字（品牌浅底+品牌字）；状态点（在线绿）                                                                                           |
| **Toast**             | 右下出现、自动消失 4s、含图标+文案+可选操作                                                                                              |
| **Progress**          | 高 8px、圆角全；正常品牌色、超阈危险色                                                                                                 |
| **Table**             | 行高 52px；数字 `font-mono` 右对齐 `tabular-nums`；排序箭头                                                                        |
| **Skeleton**          | 品牌浅底 shimmer（reduced-motion 下静态）                                                                                      |


> 每个组件都必须具备 default / hover / active / focus / disabled / loading / error / empty 状态规范。

### 6. 应用外壳与布局（App Shell）

- **桌面端**：左侧**可折叠标注侧边栏**（默认 240px，折叠为 72px 图标栏带 tooltip；激活态 = 品牌浅底 + 左侧 3px 品牌竖条 + 品牌色图标 + 中粗体）；顶部栏含全局搜索（⌘K）、页标题/面包屑、上下文「+ 新建」、通知、主题切换、头像。
- **移动端**：底部 Tab Bar 保留 5 主模块（仪表·任务·邮箱·笔记·记账，≥44px 触控区 + safe-area）；多栏模块降级为「列表 ↔ 详情」单栏切换；设置/账户收进头像菜单。**绝不**在移动端隐藏关键功能，仅重排。

### 7. 响应式断点（Responsive）


| 断点  | 宽度          | 策略                           |
| --- | ----------- | ---------------------------- |
| 手机  | <768px      | 单栏；底部 Tab；多栏降级列表↔详情；触控 ≥44px |
| 平板  | 768–1023px  | 侧边栏折叠图标栏；邮箱/笔记视空间保留双栏        |
| 桌面  | 1024–1279px | 展开侧边栏；多栏完整                   |
| 大屏  | ≥1280px     | 容器最大宽 1280 居中；留白更舒展          |


- 优先用**容器查询（`@container`）**让卡片在窄容器内自适应换行，而非整页断点。

### 8. 无障碍（Accessibility · WCAG AA）

- 对比度：正文 ≥4.5:1、大字 ≥3:1、控件 ≥3:1。
- 键盘：全功能可 Tab；命令面板/抽屉 focus trap；可见 focus 环。
- 屏幕阅读器：语义标签 + ARIA（`nav`/`region`/`dialog`/`aria-current`），图标按钮带 `aria-label`。
- 触控：交互元素 ≥44×44px。
- 缩放：使用 rem；支持 200% 缩放不破版。
- 色盲友好：状态/优先级均配图标或文字，色不作为唯一载体。

### 9. 技术栈对齐（避免风格漂移）

- React 19 + Vite + **Tailwind v4**（CSS-first，无 `tailwind.config`，令牌在 `src/index.css`）+ **shadcn/ui（new-york）** + TanStack Router/Query + Supabase + Zustand。
- 图表：`recharts`；拖拽：`@dnd-kit`；富文本：`@tiptap`；表单：`react-hook-form` + `zod` + `cva`。
- 任何新依赖若影响视觉（UI 库、图标库、动画库），须经设计令牌对齐后方可引入。

---

&nbsp;