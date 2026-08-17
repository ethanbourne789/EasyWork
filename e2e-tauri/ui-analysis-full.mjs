// e2e-tauri/ui-analysis-full.mjs
// UI 适配性全面分析 E2E 测试（增强版）
// 遍历所有主要页面，进行全面 UI 分析
// 包含：布局、按钮、信息密度、配色、视觉回归、性能、WCAG无障碍、多主题、国际化
// 运行：node e2e-tauri/ui-analysis-full.mjs

import { connect, demoLogin, navTo, shot, Report } from './helpers.mjs';
import {
  analyzeLayout,
  analyzeButtons,
  analyzeInformationDensity,
  analyzeColors,
  analyzeResponsiveness,
  generateReport,
  UI_ANALYSIS_DIR,
} from './ui-analysis.mjs';
import {
  visualRegressionTest,
  collectPerformanceMetrics,
  evaluatePerformance,
  wcagAudit,
  analyzeThemes,
  analyzeI18nOverflow,
  generateFixSuggestions,
  generateFixReport,
} from './ui-analysis-advanced.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync(UI_ANALYSIS_DIR, { recursive: true });

const report = new Report();
const allReports = [];
const allFixSuggestions = [];
let browser, page;

// 测试视口
const VIEWPORTS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet' },
  { width: 375, height: 667, name: 'mobile' },
];

// 要测试的页面
const PAGES = [
  { path: '/dashboard', label: '仪表' },
  { path: '/tasks', label: '任务' },
  { path: '/mail', label: '邮箱' },
  { path: '/notes', label: '笔记' },
  { path: '/finance', label: '记账' },
  { path: '/calendar', label: '日历' },
  { path: '/settings', label: '设置' },
];

try {
  console.log('🔌 连接到 Tauri E2E 应用...\n');
  ({ browser, page } = await connect());

  // 登录
  if (page.url().includes('/login')) {
    console.log('🔐 演示登录中...');
    await demoLogin(page);
  }
  await page.waitForTimeout(2000);

  // 设置默认桌面视口
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);

  for (const pageInfo of PAGES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 分析页面: ${pageInfo.label} (${pageInfo.path})`);
    console.log('='.repeat(60));

    try {
      // 导航到页面
      if (page.url() !== `tauri://localhost${pageInfo.path}` && !page.url().includes(pageInfo.path)) {
        await navTo(page, pageInfo.label);
      }
      await page.waitForTimeout(1500);

      const pageAnalyses = {};
      const pageScreenshots = [];

      // ============ 基础分析 ============

      // 1. 桌面端完整分析
      console.log('  🖥️  桌面端分析 (1440×900)...');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(1000);

      const desktopScreenshot = await shot(page, `ui-analysis-${pageInfo.label}-desktop`);
      pageScreenshots.push({ viewport: 'desktop', path: desktopScreenshot });

      pageAnalyses.layout = await analyzeLayout(page, { width: 1440, height: 900 });
      pageAnalyses.buttons = await analyzeButtons(page);
      pageAnalyses.density = await analyzeInformationDensity(page, { width: 1440, height: 900 });
      pageAnalyses.colors = await analyzeColors(page);

      // 2. 视觉回归测试
      console.log('  🖼️  视觉回归测试...');
      const vrResult = await visualRegressionTest(page, `${pageInfo.label}-desktop`);
      console.log(`    ${vrResult.changed ? '⚠️' : '✅'} ${vrResult.message}`);
      pageAnalyses.visual_regression = vrResult;

      // 3. 性能指标采集
      console.log('  ⚡ 性能指标分析...');
      const perfMetrics = await collectPerformanceMetrics(page);
      const perfEvaluation = evaluatePerformance(perfMetrics);
      console.log(`    LCP: ${perfMetrics.lcp}ms (${perfEvaluation.scores.lcp})`);
      console.log(`    FCP: ${perfMetrics.fcp}ms (${perfEvaluation.scores.fcp})`);
      console.log(`    CLS: ${perfMetrics.cls} (${perfEvaluation.scores.cls})`);
      console.log(`    TTFB: ${perfMetrics.ttfb}ms (${perfEvaluation.scores.ttfb})`);

      if (perfEvaluation.issues.length > 0) {
        console.log('    ⚠️  性能问题:');
        perfEvaluation.issues.forEach(issue => {
          console.log(`      ⚠️  ${issue.message}`);
        });
      }
      pageAnalyses.performance = { metrics: perfMetrics, evaluation: perfEvaluation };

      // 4. WCAG 2.1 AA 无障碍审计
      console.log('  ♿ WCAG 2.1 AA 无障碍检测...');
      const wcagResults = await wcagAudit(page);
      console.log(`    通过: ${wcagResults.passes.length}`);
      console.log(`    违反: ${wcagResults.violations.length}`);

      if (wcagResults.violations.length > 0) {
        console.log('    ❌ 无障碍问题:');
        wcagResults.violations.forEach(v => {
          console.log(`      ❌ [${v.impact}] ${v.message}`);
        });
      }
      pageAnalyses.wcag = wcagResults;

      // 5. 多主题测试
      console.log('  🌓 多主题测试...');
      const themeResults = await analyzeThemes(page);
      console.log(`    亮色主题: ${themeResults.light.colors.text_colors.length} 种文本颜色`);
      console.log(`    暗色主题: ${themeResults.dark.colors.text_colors.length} 种文本颜色`);

      if (themeResults.dark.colors.issues.length > 0) {
        console.log('    ⚠️  暗色主题问题:');
        themeResults.dark.colors.issues.forEach(issue => {
          console.log(`      ⚠️  ${issue.message}`);
        });
      }
      pageAnalyses.themes = themeResults;

      // 在暗色主题下截图
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(500);
      const darkScreenshot = await shot(page, `ui-analysis-${pageInfo.label}-desktop-dark`);
      pageScreenshots.push({ viewport: 'desktop-dark', path: darkScreenshot });

      // 恢复亮色主题
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
      });
      await page.waitForTimeout(500);

      // 6. 国际化文本溢出检测
      console.log('  🌐 国际化文本溢出检测...');
      const i18nResults = await analyzeI18nOverflow(page);
      i18nResults.forEach(lang => {
        if (lang.overflow_count > 0) {
          console.log(`    ⚠️  ${lang.language}: ${lang.overflow_count} 处可能溢出`);
        } else {
          console.log(`    ✅ ${lang.language}: 无溢出`);
        }
      });
      pageAnalyses.i18n = i18nResults;

      // 7. 响应式测试
      console.log('  📱 响应式测试...');
      const responsiveness = await analyzeResponsiveness(
        page,
        VIEWPORTS.filter(v => v.name !== 'desktop')
      );

      for (const rp of responsiveness) {
        const vpName = VIEWPORTS.find(v => v.width === rp.viewport.width)?.name || 'custom';
        const screenshot = await shot(page, `ui-analysis-${pageInfo.label}-${vpName}`);
        pageScreenshots.push({ viewport: vpName, path: screenshot });

        if (rp.has_horizontal_scroll) {
          console.log(`    ❌ ${vpName}: 水平滚动问题`);
          report.add(`${pageInfo.label}-${vpName} 无水平滚动`, false);
        } else {
          console.log(`    ✅ ${vpName}: 布局正常`);
          report.add(`${pageInfo.label}-${vpName} 无水平滚动`, true);
        }

        if (rp.layout_issues > 0) {
          console.log(`      ⚠️  ${rp.layout_issues} 个布局问题`);
        }
      }

      // 恢复桌面视口
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);

      // 8. 生成代码修复建议
      console.log('  🔧 生成修复建议...');
      const fixSuggestions = generateFixSuggestions(pageAnalyses, pageInfo.label);
      allFixSuggestions.push(...fixSuggestions);
      console.log(`    生成 ${fixSuggestions.length} 条修复建议`);

      // 生成页面报告
      const pageReport = generateReport(pageInfo.label, pageAnalyses, pageScreenshots);
      allReports.push(pageReport);

      // 保存单页面报告
      writeFileSync(
        `${UI_ANALYSIS_DIR}/${pageInfo.label}-report.json`,
        JSON.stringify(pageReport, null, 2)
      );

      const totalIssues = pageReport.summary.total_issues;
      const totalSuggestions = pageReport.summary.suggestions + fixSuggestions.length;
      report.add(`${pageInfo.label} 页面分析完成`, true,
        `问题: ${totalIssues}, 建议: ${totalSuggestions}`);

    } catch (e) {
      console.error(`  ❌ 分析 ${pageInfo.label} 时出错:`, e.message);
      report.add(`${pageInfo.label} 页面分析`, false, String(e.message).slice(0, 200));

      try {
        await shot(page, `ui-analysis-${pageInfo.label}-error`);
      } catch { /* ignore */ }
    }
  }

  // ============ 生成综合报告 ============

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 生成综合报告...');
  console.log('='.repeat(60));

  const masterReport = {
    title: 'EasyWork UI 适配性分析报告（增强版）',
    generated_at: new Date().toISOString(),
    executive_summary: {
      pages_analyzed: PAGES.length,
      viewports_tested: VIEWPORTS.length,
      themes_tested: 2,
      languages_tested: 5,
      total_issues: allReports.reduce((sum, r) => sum + r.summary.total_issues, 0),
      total_errors: allReports.reduce((sum, r) => sum + r.summary.errors, 0),
      total_warnings: allReports.reduce((sum, r) => sum + r.summary.warnings, 0),
      total_suggestions: allReports.reduce((sum, r) => sum + r.summary.suggestions, 0),
      total_fix_suggestions: allFixSuggestions.length,
      wcag_violations: allReports.reduce((sum, r) => sum + (r.analyses.wcag?.violations?.length || 0), 0),
      visual_regressions: allReports.filter(r => r.analyses.visual_regression?.changed).length,
    },
    page_reports: allReports,
    fix_suggestions: allFixSuggestions,
  };

  // 保存主报告
  writeFileSync(
    `${UI_ANALYSIS_DIR}/master-report.json`,
    JSON.stringify(masterReport, null, 2)
  );

  // 生成修复建议报告
  const fixReportContent = generateFixReport(allFixSuggestions);
  writeFileSync(
    `${UI_ANALYSIS_DIR}/Fix-Suggestions.md`,
    fixReportContent
  );

  // 生成 Markdown 综合报告
  let markdown = `# EasyWork UI 适配性分析报告（增强版）\n\n`;
  markdown += `**生成时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;

  markdown += `## 执行摘要\n\n`;
  markdown += `- **分析页面**: ${masterReport.executive_summary.pages_analyzed} 个\n`;
  markdown += `- **测试视口**: ${masterReport.executive_summary.viewports_tested} 个 (桌面/平板/移动端)\n`;
  markdown += `- **测试主题**: ${masterReport.executive_summary.themes_tested} 个 (亮色/暗色)\n`;
  markdown += `- **测试语言**: ${masterReport.executive_summary.languages_tested} 种 (中文/英文/德文/俄文/日文)\n`;
  markdown += `- **总问题数**: ${masterReport.executive_summary.total_issues}\n`;
  markdown += `  - 错误: ${masterReport.executive_summary.total_errors}\n`;
  markdown += `  - 警告: ${masterReport.executive_summary.total_warnings}\n`;
  markdown += `- **WCAG 违规**: ${masterReport.executive_summary.wcag_violations}\n`;
  markdown += `- **视觉回归**: ${masterReport.executive_summary.visual_regressions} 个页面有变化\n`;
  markdown += `- **优化建议**: ${masterReport.executive_summary.total_suggestions} 条\n`;
  markdown += `- **代码修复**: ${masterReport.executive_summary.total_fix_suggestions} 条\n\n`;

  markdown += `## 性能总览\n\n`;
  markdown += `| 页面 | LCP | FCP | CLS | TTFB |\n`;
  markdown += `|------|-----|-----|-----|------|\n`;
  allReports.forEach(pr => {
    if (pr.analyses.performance?.metrics) {
      const m = pr.analyses.performance.metrics;
      markdown += `| ${pr.page} | ${m.lcp}ms | ${m.fcp}ms | ${m.cls} | ${m.ttfb}ms |\n`;
    }
  });
  markdown += `\n`;

  markdown += `## 各页面详细分析\n\n`;
  allReports.forEach(pr => {
    markdown += `### ${pr.page}\n\n`;
    markdown += `- 问题: ${pr.summary.total_issues}\n`;
    markdown += `- 错误: ${pr.summary.errors}\n`;
    markdown += `- 警告: ${pr.summary.warnings}\n`;
    markdown += `- 建议: ${pr.summary.suggestions}\n\n`;

    // 性能数据
    if (pr.analyses.performance) {
      const perf = pr.analyses.performance;
      markdown += `**性能指标**:\n`;
      markdown += `- LCP: ${perf.metrics.lcp}ms (${perf.evaluation.scores.lcp})\n`;
      markdown += `- FCP: ${perf.metrics.fcp}ms (${perf.evaluation.scores.fcp})\n`;
      markdown += `- CLS: ${perf.metrics.cls} (${perf.evaluation.scores.cls})\n`;
      markdown += `- TTFB: ${perf.metrics.ttfb}ms (${perf.evaluation.scores.ttfb})\n\n`;

      if (perf.evaluation.issues.length > 0) {
        markdown += `**性能问题**:\n`;
        perf.evaluation.issues.forEach(issue => {
          markdown += `- ⚠️  ${issue.message}\n`;
        });
        markdown += `\n`;
      }
    }

    // WCAG 无障碍
    if (pr.analyses.wcag?.violations?.length > 0) {
      markdown += `**WCAG 2.1 AA 违规**:\n`;
      pr.analyses.wcag.violations.forEach(v => {
        markdown += `- ❌ [${v.impact}] ${v.message} (${v.wcag_criterion})\n`;
      });
      markdown += `\n`;
    }

    // 主题问题
    if (pr.analyses.themes?.dark?.colors?.issues?.length > 0) {
      markdown += `**暗色主题问题**:\n`;
      pr.analyses.themes.dark.colors.issues.forEach(issue => {
        markdown += `- ⚠️  ${issue.message}\n`;
      });
      markdown += `\n`;
    }

    // 国际化溢出
    if (pr.analyses.i18n) {
      const overflows = pr.analyses.i18n.filter(l => l.overflow_count > 0);
      if (overflows.length > 0) {
        markdown += `**国际化文本溢出**:\n`;
        overflows.forEach(lang => {
          markdown += `- ⚠️  ${lang.language}: ${lang.overflow_count} 处可能溢出\n`;
        });
        markdown += `\n`;
      }
    }

    // 视觉回归
    if (pr.analyses.visual_regression) {
      const vr = pr.analyses.visual_regression;
      markdown += `**视觉回归**: ${vr.changed ? '⚠️ 有变化' : '✅ 无变化'} - ${vr.message}\n\n`;
    }

    markdown += `**截图**:\n`;
    pr.screenshots?.forEach(s => {
      markdown += `- [${s.viewport}](${s.path})\n`;
    });
    markdown += `\n---\n\n`;
  });

  markdown += `## 代码修复建议\n\n`;
  markdown += `详细修复建议请查看 [Fix-Suggestions.md](./Fix-Suggestions.md)\n\n`;

  if (allFixSuggestions.length > 0) {
    markdown += `**前 10 条高优先级建议**:\n\n`;
    allFixSuggestions.slice(0, 10).forEach((suggestion, index) => {
      const icon = suggestion.severity === 'error' ? '🔴' : suggestion.severity === 'warning' ? '🟡' : '🟢';
      markdown += `${icon} **${suggestion.title}**\n`;
      markdown += `- 描述: ${suggestion.description}\n`;
      markdown += `- 修复: ${suggestion.fix}\n\n`;
    });
  } else {
    markdown += `✅ 暂无需要修复的问题！\n\n`;
  }

  markdown += `## 截图索引\n\n`;
  markdown += `所有截图保存在 \`${UI_ANALYSIS_DIR}\` 目录\n\n`;

  writeFileSync(
    `${UI_ANALYSIS_DIR}/UI-Analysis-Report.md`,
    markdown
  );

  console.log(`\n✅ 分析完成！`);
  console.log(`📁 报告位置: ${UI_ANALYSIS_DIR}/`);
  console.log(`   - master-report.json (完整 JSON 报告)`);
  console.log(`   - UI-Analysis-Report.md (Markdown 可读报告)`);
  console.log(`   - Fix-Suggestions.md (代码修复建议)`);
  console.log(`   - 各页面单独报告: {页面名}-report.json`);
  console.log(`   - 截图: ui-analysis-{页面}-{视口}.png`);
  console.log(`   - 视觉回归差异: diffs/ 目录`);

} catch (e) {
  console.error('❌ UI 分析执行失败:', e);
  report.add('UI 分析执行', false, String(e.message).slice(0, 300));

  try {
    await shot(page, 'ui-analysis-fatal-error');
  } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 E2E 测试汇总');
  console.log('='.repeat(60));

  const { writeFileSync: wf } = await import('node:fs');
  wf(`${UI_ANALYSIS_DIR}/test-summary.json`, JSON.stringify(summary, null, 2));

  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
