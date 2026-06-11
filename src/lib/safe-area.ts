/**
 * Safe Area Insets 初始化工具
 *
 * 多级防御策略获取设备安全区域（状态栏/导航栏/刘海/挖孔屏）：
 *   Level ①  CSS env()              → iOS Safari 原生支持（已写在 index.css 中）
 *   Level ②  Tauri 平台检测         → Android：移除 enableEdgeToEdge() 后无重叠
 *   Level ③  桌面端回退 0px          → Windows / macOS / Linux
 *
 * 注意：Android 端通过 MainActivity.kt 移除了 enableEdgeToEdge()，
 * 系统会自动处理状态栏边距，不再需要 JS 注入 inset 值。
 * 此文件主要保留作为扩展点，方便未来接入安全区域插件。
 */

/**
 * 初始化安全区域。
 *
 * 在 iOS 上，CSS env(safe-area-inset-*) 会自动生效。
 * 在 Android 上，MainActivity 已移除 edge-to-edge，系统自行处理。
 * 在桌面上，不存在安全区域问题。
 */
export async function initSafeArea(): Promise<void> {
  // 目前无需额外 JS 逻辑。
  //
  // 未来如果接入 tauri-plugin-safe-area-insets 社区插件，
  // 可在此处调用插件 API 获取真实 inset 值并设为 CSS 变量：
  //
  //   import { getSafeAreaInsets } from 'tauri-plugin-safe-area-insets';
  //   const insets = await getSafeAreaInsets();
  //   document.documentElement.style.setProperty('--safe-top', `${insets.top}px`);
  //   // ...
  //
  // 回退：CSS env() 为 iOS 提供支持，Android 通过原生移除 edge-to-edge 解决。
}
