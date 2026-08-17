// e2e-tauri/ui-analysis.mjs
// UI 适配性分析工具：布局、按钮、信息密度、配色分析
// 依赖：EasyWork.exe 已使用 tauri-e2e.conf.json 构建（带 --remote-debugging-port=9222）

import { connect, demoLogin, shot, Report } from './helpers.mjs';

export const UI_ANALYSIS_DIR = 'e2e-screenshots/ui-analysis';

/**
 * 分析页面布局问题
 */
export async function analyzeLayout(page, viewport) {
  const results = await page.evaluate((vp) => {
    const issues = [];
    const warnings = [];

    // 1. 检查元素溢出
    const allElements = document.querySelectorAll('*');
    let overflowCount = 0;
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (el.offsetWidth && (el.scrollWidth > el.offsetWidth || el.scrollHeight > el.offsetHeight)) {
        if (style.overflow === 'hidden' || style.overflow === 'auto') {
          overflowCount++;
        }
      }
    });
    if (overflowCount > 20) {
      issues.push({
        type: 'overflow_elements',
        severity: 'warning',
        message: `检测到 ${overflowCount} 个元素存在内容溢出，可能影响可阅读性`,
      });
    }

    // 2. 检查重叠元素
    const boundedElements = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
    const overlaps = [];
    const rects = [];

    boundedElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rects.push({ el: el.tagName, rect, text: el.textContent?.trim()?.slice(0, 30) });
      }
    });

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].rect;
        const b = rects[j].rect;
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const overlapArea = overlapX * overlapY;

        if (overlapArea > 100 && overlapArea > (a.width * a.height * 0.5)) {
          overlaps.push(`${rects[i].el} "${rects[i].text}" 与 ${rects[j].el} "${rects[j].text}" 重叠 ${Math.round(overlapArea)}px²`);
        }
      }
    }

    if (overlaps.length > 0) {
      issues.push({
        type: 'overlapping_elements',
        severity: 'error',
        message: `检测到 ${overlaps.length} 组元素重叠`,
        details: overlaps.slice(0, 5),
      });
    }

    // 3. 检查可点击元素尺寸（无障碍）
    const tooSmall = [];
    boundedElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) {
        tooSmall.push({
          element: el.tagName,
          text: el.textContent?.trim()?.slice(0, 20) || el.getAttribute('aria-label') || '(无文本)',
          size: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        });
      }
    });

    if (tooSmall.length > 0) {
      warnings.push({
        type: 'small_touch_targets',
        severity: 'warning',
        message: `${tooSmall.length} 个交互元素触控区小于 44×44px（WCAG 标准）`,
        examples: tooSmall.slice(0, 5),
      });
    }

    // 4. 检查视口中的内容分布
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const emptySpace = document.querySelector('.overflow-hidden, main, [role="main"]');

    if (emptySpace) {
      const rect = emptySpace.getBoundingClientRect();
      const contentHeight = rect.height;
      const emptyRatio = 1 - (contentHeight / vh);

      if (emptyRatio > 0.4 && vp.width >= 1024) {
        warnings.push({
          type: 'low_content_density',
          severity: 'info',
          message: `页面内容区域仅占用视口 ${(1 - emptyRatio) * 100 | 0}%，可能存在信息密度不足`,
        });
      }
    }

    // 5. 检查侧边栏宽度
    const sidebar = document.querySelector('aside, [role="navigation"]');
    if (sidebar) {
      const sidebarWidth = sidebar.offsetWidth;
      if (sidebarWidth > 320) {
        warnings.push({
          type: 'wide_sidebar',
          severity: 'info',
          message: `侧边栏宽度 ${sidebarWidth}px 超过 320px，可能占用过多空间`,
        });
      } else if (sidebarWidth < 60) {
        warnings.push({
          type: 'narrow_sidebar',
          severity: 'info',
          message: `侧边栏宽度 ${sidebarWidth}px，可能为折叠状态`,
        });
      }
    }

    // 6. 检查水平滚动
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 5) {
      issues.push({
        type: 'horizontal_scroll',
        severity: 'error',
        message: '页面存在水平滚动，响应式布局可能存在问题',
      });
    }

    return { issues, warnings, viewport: vp };
  }, viewport);

  return results;
}

/**
 * 分析按钮重复与缺失
 */
export async function analyzeButtons(page) {
  return await page.evaluate(() => {
    const analysis = {
      duplicates: [],
      missing: [],
      allButtons: [],
    };

    // 收集所有按钮
    const buttons = document.querySelectorAll('button, [role="button"], a.btn, a[role="button"]');
    const buttonMap = new Map();

    buttons.forEach((btn, index) => {
      const text = (btn.textContent || '').trim().replace(/\s+/g, ' ');
      const ariaLabel = btn.getAttribute('aria-label') || '';
      const icon = btn.querySelector('svg, [class*="icon"]');
      const hasIcon = !!icon;
      const rect = btn.getBoundingClientRect();

      const identifier = text || ariaLabel || `(图标按钮 ${index})`;

      analysis.allButtons.push({
        text: identifier,
        hasIcon,
        visible: rect.width > 0 && rect.height > 0,
        position: { x: Math.round(rect.x), y: Math.round(rect.y) },
      });

      if (text && text.length > 2) {
        if (!buttonMap.has(text)) {
          buttonMap.set(text, []);
        }
        buttonMap.get(text).push(btn);
      }
    });

    // 检测重复按钮
    buttonMap.forEach((btns, text) => {
      if (btns.length > 2) {
        analysis.duplicates.push({
          text,
          count: btns.length,
          message: `按钮 "${text}" 出现 ${btns.length} 次，可能重复`,
        });
      }
    });

    // 检查关键功能按钮是否存在
    const criticalActions = [
      { pattern: /新建|创建|New|Create/, expected: true, context: '创建功能' },
      { pattern: /保存|Save/, expected: true, context: '保存功能' },
      { pattern: /删除|Delete|移除|Remove/, expected: false, context: '删除功能' },
      { pattern: /设置|Settings|配置|Config/, expected: false, context: '设置入口' },
      { pattern: /搜索|Search|查找|Find/, expected: true, context: '搜索功能' },
    ];

    const bodyText = document.body.textContent || '';
    const buttonTexts = analysis.allButtons.map(b => b.text).join(' ');

    criticalActions.forEach(action => {
      const found = action.pattern.test(bodyText) || action.pattern.test(buttonTexts);
      if (action.expected && !found) {
        analysis.missing.push({
          context: action.context,
          pattern: action.pattern.toString(),
          message: `${action.context}按钮可能缺失（未匹配到 ${action.pattern}）`,
        });
      }
    });

    return analysis;
  });
}

/**
 * 分析页面信息密度
 */
export async function analyzeInformationDensity(page, viewport) {
  return await page.evaluate((vp) => {
    const density = {
      metrics: {},
      suggestions: [],
    };

    // 计算文本区域占比
    const textElements = document.querySelectorAll('p, li, td, span, label, h1, h2, h3, h4, h5, h6');
    let textArea = 0;
    let totalViewport = vp.width * vp.height;

    textElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < vp.height) {
        textArea += rect.width * rect.height;
      }
    });

    density.metrics.text_coverage = Math.round((textArea / totalViewport) * 10000) / 100;

    // 计算交互元素密度
    const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="tab"]');
    let interactiveArea = 0;
    interactiveElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      interactiveArea += rect.width * rect.height;
    });

    density.metrics.interactive_coverage = Math.round((interactiveArea / totalViewport) * 10000) / 100;
    density.metrics.interactive_count = interactiveElements.length;

    // 计算卡片/容器数量
    const cards = document.querySelectorAll('.card, .border, [class*="Card"], [class*="card"]');
    density.metrics.card_count = cards.length;

    // 计算平均行高与间距
    const lines = document.querySelectorAll('p, li, td');
    if (lines.length > 0) {
      let totalLineHeight = 0;
      let totalMargin = 0;
      lines.forEach(line => {
        const style = window.getComputedStyle(line);
        totalLineHeight += parseFloat(style.lineHeight) || 0;
        totalMargin += parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      });
      density.metrics.avg_line_height = Math.round(totalLineHeight / lines.length * 100) / 100;
      density.metrics.avg_vertical_margin = Math.round(totalMargin / lines.length * 100) / 100;
    }

    // 密度建议
    if (density.metrics.text_coverage < 15) {
      density.suggestions.push({
        type: 'low_density',
        message: '页面文本覆盖率低于 15%，考虑增加内容紧凑度或减少空白区域',
        priority: 'medium',
      });
    } else if (density.metrics.text_coverage > 60) {
      density.suggestions.push({
        type: 'high_density',
        message: '页面文本覆盖率超过 60%，信息过载，建议增加留白或使用折叠/分页',
        priority: 'high',
      });
    }

    if (interactiveElements.length > 30) {
      density.suggestions.push({
        type: 'too_many_controls',
        message: `页面包含 ${interactiveElements.length} 个交互元素，可能过于复杂`,
        priority: 'medium',
      });
    }

    if (cards.length > 8) {
      density.suggestions.push({
        type: 'many_cards',
        message: `页面有 ${cards.length} 个卡片/容器，考虑使用网格布局优化空间利用`,
        priority: 'low',
      });
    }

    return density;
  }, viewport);
}

/**
 * 分析配色与对比度
 */
export async function analyzeColors(page) {
  return await page.evaluate(() => {
    const colorAnalysis = {
      contrast_issues: [],
      color_palette: new Set(),
      suggestions: [],
    };

    // 辅助函数：计算相对亮度
    function luminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    // 辅助函数：计算对比度
    function contrastRatio(l1, l2) {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    // 采样页面中的文本元素
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, label, a, button, li, td, th');

    textElements.forEach(el => {
      const style = window.getComputedStyle(el);
      const textColor = style.color;
      const bgColor = style.backgroundColor;

      if (textColor && bgColor) {
        const match = textColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        const bgMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

        if (match && bgMatch) {
          const fg = match.slice(1).map(Number);
          const bg = bgMatch.slice(1).map(Number);

          const fgLum = luminance(...fg);
          const bgLum = luminance(...bg);
          const ratio = contrastRatio(fgLum, bgLum);

          colorAnalysis.color_palette.add(textColor);

          // WCAG AA: 普通文字 ≥ 4.5:1，大字 ≥ 3:1
          const fontSize = parseFloat(style.fontSize);
          const isLargeText = fontSize >= 24 || (fontSize >= 18 && parseInt(style.fontWeight) >= 600);
          const minRatio = isLargeText ? 3 : 4.5;

          if (ratio < minRatio) {
            colorAnalysis.contrast_issues.push({
              element: el.tagName,
              text: (el.textContent || '').trim().slice(0, 40),
              foreground: textColor,
              background: bgColor,
              ratio: ratio.toFixed(2),
              required: `${minRatio}:1`,
              severity: ratio < 3 ? 'error' : 'warning',
            });
          }
        }
      }
    });

    // 分析品牌色使用
    const brandElements = document.querySelectorAll('[class*="brand"], [class*="primary"]');
    let brandArea = 0;
    const viewportArea = document.documentElement.clientWidth * document.documentElement.clientHeight;

    brandElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      brandArea += rect.width * rect.height;
    });

    const brandRatio = (brandArea / viewportArea) * 100;
    if (brandRatio > 15) {
      colorAnalysis.suggestions.push({
        type: 'excessive_brand_color',
        message: `品牌色占据视口 ${brandRatio.toFixed(1)}%，建议控制在 10% 以内（安静优先原则）`,
        priority: 'medium',
      });
    } else if (brandRatio < 2) {
      colorAnalysis.suggestions.push({
        type: 'low_brand_presence',
        message: `品牌色仅占视口 ${brandRatio.toFixed(1)}%，品牌存在感较弱`,
        priority: 'low',
      });
    }

    // 检查状态色使用
    const statusColors = {
      success: document.querySelectorAll('[class*="success"], [class*="green"]'),
      warning: document.querySelectorAll('[class*="warning"], [class*="yellow"]'),
      error: document.querySelectorAll('[class*="error"], [class*="destructive"], [class*="red"]'),
    };

    Object.entries(statusColors).forEach(([status, elements]) => {
      if (elements.length > 0) {
        const hasIcon = Array.from(elements).some(el => el.querySelector('svg, [class*="icon"]'));
        if (!hasIcon) {
          colorAnalysis.suggestions.push({
            type: 'color_only_status',
            message: `${status} 状态仅通过颜色表达，建议添加图标或文字标签（色盲友好）`,
            priority: 'high',
          });
        }
      }
    });

    return {
      ...colorAnalysis,
      color_palette: Array.from(colorAnalysis.color_palette),
    };
  });
}

/**
 * 响应式测试
 */
export async function analyzeResponsiveness(page, viewports) {
  const results = [];

  for (const vp of viewports) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(800);

    const layout = await analyzeLayout(page, vp);
    const density = await analyzeInformationDensity(page, vp);

    results.push({
      viewport: vp,
      layout_issues: layout.issues.length,
      layout_warnings: layout.warnings.length,
      density_metrics: density.metrics,
      has_horizontal_scroll: layout.issues.some(i => i.type === 'horizontal_scroll'),
    });
  }

  return results;
}

/**
 * 生成综合分析报告
 */
export function generateReport(pageName, analyses, screenshots) {
  const report = {
    page: pageName,
    timestamp: new Date().toISOString(),
    summary: {
      total_issues: 0,
      errors: 0,
      warnings: 0,
      suggestions: 0,
    },
    analyses,
    screenshots,
  };

  // 统计问题
  Object.values(analyses).forEach(analysis => {
    if (analysis.issues) {
      analysis.issues.forEach(issue => {
        report.summary.total_issues++;
        if (issue.severity === 'error') report.summary.errors++;
        else if (issue.severity === 'warning') report.summary.warnings++;
      });
    }
    if (analysis.warnings) {
      analysis.warnings.forEach(w => {
        report.summary.total_issues++;
        report.summary.warnings++;
      });
    }
    if (analysis.suggestions) {
      report.summary.suggestions += analysis.suggestions.length;
    }
    if (analysis.contrast_issues) {
      analysis.contrast_issues.forEach(ci => {
        report.summary.total_issues++;
        if (ci.severity === 'error') report.summary.errors++;
        else report.summary.warnings++;
      });
    }
  });

  return report;
}
