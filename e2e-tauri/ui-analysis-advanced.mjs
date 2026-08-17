// e2e-tauri/ui-analysis-advanced.mjs
// 高级 UI 分析功能扩展
// 视觉回归、性能指标、无障碍深度检测、多主题、国际化、代码修复建议

import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export const BASELINE_DIR = 'e2e-screenshots/baseline';
export const DIFF_DIR = 'e2e-screenshots/ui-analysis/diffs';

// ========================================
// 1. 视觉回归测试 (Visual Regression)
// ========================================

/**
 * 对截图进行像素级比较，检测视觉变化
 */
export async function visualRegressionTest(page, testName, threshold = 0.02) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(DIFF_DIR, { recursive: true });

  const baselinePath = `${BASELINE_DIR}/${testName}.png`;
  const currentPath = `${DIFF_DIR}/${testName}-current.png`;
  const diffPath = `${DIFF_DIR}/${testName}-diff.png`;

  // 截取当前截图
  await page.screenshot({ path: currentPath, fullPage: false });

  // 如果不存在基准截图，创建并跳过比较
  if (!existsSync(baselinePath)) {
    await page.screenshot({ path: baselinePath, fullPage: false });
    return {
      has_baseline: false,
      changed: false,
      message: '首次运行，已创建基准截图',
      baseline_path: baselinePath,
    };
  }

  // 使用 ImageMagick 进行像素比较
  try {
    const magickPath = process.platform === 'win32' 
      ? '"C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe"'
      : 'magick';
    const result = execSync(
      `${magickPath} "${baselinePath}" "${currentPath}" -metric AE "${diffPath}" 2>&1`,
      { encoding: 'utf8', timeout: 10000 }
    );

    const diffPixels = parseFloat(result.trim());
    const totalPixels = 1440 * 900; // 假设桌面视口
    const diffPercentage = diffPixels / totalPixels;

    return {
      has_baseline: true,
      changed: diffPercentage > threshold,
      diff_percentage: Math.round(diffPercentage * 10000) / 100,
      diff_pixels: diffPixels,
      threshold,
      message: diffPercentage > threshold
        ? `视觉变化 ${Math.round(diffPercentage * 10000) / 100}% 超过阈值 ${threshold * 100}%`
        : `视觉变化 ${Math.round(diffPercentage * 10000) / 100}% 在可接受范围内`,
      diff_path,
    };
  } catch (e) {
    // ImageMagick 不可用，使用文件哈希比较
    const baselineHash = createHash('md5').update(readFileSync(baselinePath)).digest('hex');
    const currentHash = createHash('md5').update(readFileSync(currentPath)).digest('hex');

    return {
      has_baseline: true,
      changed: baselineHash !== currentHash,
      method: 'hash_fallback',
      message: baselineHash !== currentHash ? '截图发生变化（哈希比较）' : '截图未变化',
      warning: 'ImageMagick 未安装，使用哈希比较（精度较低）',
    };
  }
}

/**
 * 更新基准截图
 */
export async function updateBaseline(page, testName) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  const baselinePath = `${BASELINE_DIR}/${testName}.png`;
  await page.screenshot({ path: baselinePath, fullPage: false });
  return baselinePath;
}

// ========================================
// 2. 性能指标分析 (Performance Metrics)
// ========================================

/**
 * 采集页面性能指标：LCP, FID, CLS, TTFB
 */
export async function collectPerformanceMetrics(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      const metrics = {
        lcp: 0,        // Largest Contentful Paint
        fid: 0,        // First Input Delay (estimated)
        cls: 0,        // Cumulative Layout Shift
        ttfb: 0,       // Time to First Byte
        fcp: 0,        // First Contentful Paint
        load_time: 0,  // DOMContentLoaded time
      };

      // LCP - Largest Contentful Paint
      try {
        const entries = performance.getEntriesByType('largest-contentful-paint');
        if (entries.length > 0) {
          metrics.lcp = Math.round(entries[entries.length - 1].startTime);
        }
      } catch (e) {
        // LCP entries not available
      }

      // FCP - First Contentful Paint
      try {
        const paintEntries = performance.getEntriesByType('paint');
        for (const entry of paintEntries) {
          if (entry.name === 'first-contentful-paint') {
            metrics.fcp = Math.round(entry.startTime);
          }
        }
      } catch (e) {
        // Paint entries not available
      }

      // CLS - Cumulative Layout Shift
      try {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        metrics.cls = Math.round(clsValue * 10000) / 10000;
      } catch (e) {
        // Layout shift observer not available
      }

      // TTFB - Time to First Byte
      try {
        const navEntry = performance.getEntriesByType('navigation')[0];
        if (navEntry) {
          metrics.ttfb = Math.round(navEntry.responseStart);
          metrics.load_time = Math.round(navEntry.domContentLoadedEventEnd - navEntry.startTime);
        }
      } catch (e) {
        // Navigation entry not available
      }

      // FID estimation (using first input event)
      metrics.fid = 0; // FID can only be measured during actual user interaction

      resolve(metrics);
    });
  });
}

/**
 * 评估性能等级
 */
export function evaluatePerformance(metrics) {
  const scores = {
    lcp: metrics.lcp < 2500 ? 'good' : metrics.lcp < 4000 ? 'needs-improvement' : 'poor',
    fid: metrics.fid < 100 ? 'good' : metrics.fid < 300 ? 'needs-improvement' : 'poor',
    cls: metrics.cls < 0.1 ? 'good' : metrics.cls < 0.25 ? 'needs-improvement' : 'poor',
    ttfb: metrics.ttfb < 800 ? 'good' : metrics.ttfb < 1800 ? 'needs-improvement' : 'poor',
    fcp: metrics.fcp < 1800 ? 'good' : metrics.fcp < 3000 ? 'needs-improvement' : 'poor',
  };

  const issues = [];
  Object.entries(scores).forEach(([metric, score]) => {
    if (score === 'poor') {
      issues.push({
        metric,
        value: metrics[metric],
        score,
        message: `${metric.toUpperCase()} ${metrics[metric]}ms 表现较差，建议优化`,
      });
    } else if (score === 'needs-improvement') {
      issues.push({
        metric,
        value: metrics[metric],
        score,
        message: `${metric.toUpperCase()} ${metrics[metric]}ms 需要改进`,
      });
    }
  });

  return { scores, issues };
}

// ========================================
// 3. WCAG 2.1 AA 深度无障碍检测
// ========================================

/**
 * 完整的 WCAG 2.1 AA 无障碍审计
 */
export async function wcagAudit(page) {
  return await page.evaluate(() => {
    const audit = {
      violations: [],
      passes: [],
      not_applicable: [],
    };

    // 1. 图片 alt 文本检查
    const images = document.querySelectorAll('img');
    images.forEach((img, index) => {
      const alt = img.getAttribute('alt');
      if (!alt && !img.getAttribute('aria-label') && !img.getAttribute('aria-hidden')) {
        audit.violations.push({
          rule: 'image-alt',
          wcag_criterion: '1.1.1 Non-text Content',
          impact: 'serious',
          element: `IMG[${index}]`,
          message: `图片缺少 alt 文本: ${img.src?.slice(-30) || '未知源'}`,
          help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
        });
      } else {
        audit.passes.push({ rule: 'image-alt', element: `IMG[${index}]` });
      }
    });

    // 2. 表单标签检查
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    inputs.forEach((input, index) => {
      const id = input.id;
      const label = input.getAttribute('aria-label');
      const labelledby = input.getAttribute('aria-labelledby');
      const title = input.getAttribute('title');
      const placeholder = input.getAttribute('placeholder');

      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAria = label || labelledby;

      if (!hasLabel && !hasAria && !title) {
        audit.violations.push({
          rule: 'form-label',
          wcag_criterion: '1.3.1 Info and Relationships',
          impact: 'serious',
          element: `${input.tagName}[${index}]`,
          message: `${input.tagName} 缺少关联的 label（有 placeholder: "${placeholder}"）`,
          help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        });
      } else {
        audit.passes.push({ rule: 'form-label', element: `${input.tagName}[${index}]` });
      }
    });

    // 3. 颜色对比度检查 (已包含在配色分析中，这里只做补充)
    const lowContrastElements = [];
    document.querySelectorAll('p, span, h1, h2, h3, a, button, li, td').forEach(el => {
      const style = window.getComputedStyle(el);
      const fg = style.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      const bg = style.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

      if (fg && bg) {
        const lum = (r, g, b) => {
          const [rs, gs, bs] = [r, g, b].map(c => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const ratio = (l1, l2) => {
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        };

        const fgLum = lum(...fg.slice(1).map(Number));
        const bgLum = lum(...bg.slice(1).map(Number));
        const contrast = ratio(fgLum, bgLum);

        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight);
        const isLarge = fontSize >= 24 || (fontSize >= 18 && fontWeight >= 600);
        const minRatio = isLarge ? 3 : 4.5;

        if (contrast < minRatio) {
          lowContrastElements.push({
            element: el.tagName,
            text: (el.textContent || '').trim().slice(0, 30),
            ratio: contrast.toFixed(2),
            required: `${minRatio}:1`,
          });
        }
      }
    });

    if (lowContrastElements.length > 0) {
      audit.violations.push({
        rule: 'color-contrast',
        wcag_criterion: '1.4.3 Contrast (Minimum)',
        impact: 'serious',
        count: lowContrastElements.length,
        message: `${lowContrastElements.length} 个元素对比度不满足 WCAG AA`,
        examples: lowContrastElements.slice(0, 5),
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
      });
    }

    // 4. 键盘可访问性检查
    const focusableElements = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const hiddenFocusable = [];
    focusableElements.forEach((el, index) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const isHidden = style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0;

      if (isHidden) {
        hiddenFocusable.push(el);
      }
    });

    if (hiddenFocusable.length > 0) {
      audit.violations.push({
        rule: 'hidden-focusable',
        wcag_criterion: '2.1.1 Keyboard',
        impact: 'moderate',
        count: hiddenFocusable.length,
        message: `${hiddenFocusable.length} 个不可见元素仍然可聚焦`,
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html',
      });
    }

    // 5. 页面语言检查
    const htmlLang = document.documentElement.getAttribute('lang');
    if (!htmlLang) {
      audit.violations.push({
        rule: 'page-language',
        wcag_criterion: '3.1.1 Language of Page',
        impact: 'moderate',
        message: '<html> 元素缺少 lang 属性',
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html',
      });
    } else {
      audit.passes.push({ rule: 'page-language', value: htmlLang });
    }

    // 6. 链接目的检查
    const links = document.querySelectorAll('a[href]');
    const ambiguousLinks = [];
    links.forEach((link, index) => {
      const text = (link.textContent || '').trim();
      if (text === '点击这里' || text === 'read more' || text === 'more' || text === 'link') {
        ambiguousLinks.push({
          text,
          href: link.getAttribute('href'),
        });
      }
    });

    if (ambiguousLinks.length > 0) {
      audit.violations.push({
        rule: 'link-purpose',
        wcag_criterion: '2.4.4 Link Purpose (In Context)',
        impact: 'moderate',
        count: ambiguousLinks.length,
        message: `${ambiguousLinks.length} 个链接使用模糊文本`,
        examples: ambiguousLinks.slice(0, 5),
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html',
      });
    }

    // 7. 标题层级检查
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;
    const headingSkips = [];

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName[1]);
      if (level > lastLevel + 1 && lastLevel > 0) {
        headingSkips.push({
          element: heading.tagName,
          text: heading.textContent.trim().slice(0, 30),
          expected: `h${lastLevel + 1}`,
          actual: heading.tagName,
        });
      }
      lastLevel = level;
    });

    if (headingSkips.length > 0) {
      audit.violations.push({
        rule: 'heading-level',
        wcag_criterion: '1.3.1 Info and Relationships',
        impact: 'moderate',
        count: headingSkips.length,
        message: `${headingSkips.length} 处标题层级跳跃`,
        examples: headingSkips.slice(0, 5),
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
      });
    }

    // 8. ARIA 属性检查
    const allElements = document.querySelectorAll('*');
    const invalidAria = [];

    allElements.forEach(el => {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('aria-')) {
          const value = attr.value;
          if (value === '' || value === 'undefined' || value === 'null') {
            invalidAria.push({
              element: el.tagName,
              attribute: attr.name,
              value,
            });
          }
        }
      }
    });

    if (invalidAria.length > 0) {
      audit.violations.push({
        rule: 'aria-valid',
        wcag_criterion: '4.1.2 Name, Role, Value',
        impact: 'serious',
        count: invalidAria.length,
        message: `${invalidAria.length} 个无效的 ARIA 属性值`,
        examples: invalidAria.slice(0, 5),
        help_url: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
      });
    }

    // 9. Landmark 区域检查
    const landmarks = {
      banner: document.querySelector('[role="banner"], header'),
      navigation: document.querySelector('[role="navigation"], nav'),
      main: document.querySelector('[role="main"], main'),
      contentinfo: document.querySelector('[role="contentinfo"], footer'),
    };

    Object.entries(landmarks).forEach(([name, element]) => {
      if (element) {
        audit.passes.push({ rule: `landmark-${name}`, element: element.tagName });
      } else {
        audit.not_applicable.push({
          rule: `landmark-${name}`,
          message: `未找到 ${name} landmark`,
        });
      }
    });

    return audit;
  });
}

// ========================================
// 4. 多主题测试 (Multi-Theme Testing)
// ========================================

/**
 * 切换主题并分析
 */
export async function analyzeThemes(page) {
  const results = { light: null, dark: null };

  // 切换到亮色主题
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    window.dispatchEvent(new CustomEvent('theme-change', { detail: 'light' }));
  });
  await page.waitForTimeout(500);

  results.light = {
    theme: 'light',
    colors: await analyzeColorsInTheme(page),
  };

  // 切换到暗色主题
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    window.dispatchEvent(new CustomEvent('theme-change', { detail: 'dark' }));
  });
  await page.waitForTimeout(500);

  results.dark = {
    theme: 'dark',
    colors: await analyzeColorsInTheme(page),
  };

  return results;
}

/**
 * 分析当前主题下的配色
 */
export async function analyzeColorsInTheme(page) {
  return await page.evaluate(() => {
    const analysis = {
      primary_colors: [],
      text_colors: [],
      background_colors: new Set(),
      issues: [],
    };

    // 采样主要元素的颜色
    const elements = document.querySelectorAll('.bg-primary, .text-primary, .bg-background, .text-foreground, .bg-card');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        analysis.background_colors.add(style.backgroundColor);
      }
      if (style.color !== 'rgba(0, 0, 0, 0)') {
        analysis.text_colors.push(style.color);
      }
    });

    // 检查暗色主题下的特定问题
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      // 检查白色背景元素（暗色主题下的常见问题）
      const whiteBackgrounds = document.querySelectorAll('[style*="background"]');
      whiteBackgrounds.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.backgroundColor === 'rgb(255, 255, 255)') {
          analysis.issues.push({
            type: 'white_background_in_dark',
            message: `暗色主题下发现白色背景元素: ${el.tagName}`,
          });
        }
      });
    }

    return {
      ...analysis,
      background_colors: Array.from(analysis.background_colors),
    };
  });
}

// ========================================
// 5. 国际化测试 (Internationalization)
// ========================================

/**
 * 检测多语言文本溢出
 */
export async function analyzeI18nOverflow(page, languages = ['zh-CN', 'en', 'de', 'ru', 'ja']) {
  const results = [];

  // 获取所有包含文本的元素
  const textElements = await page.evaluate(() => {
    // 辅助函数：获取元素选择器
    function getSelector(element) {
      if (element.id) return `#${element.id}`;
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c && !c.startsWith('animate-') && !c.startsWith('group-')).slice(0, 3);
        if (classes.length > 0) return `${element.tagName}.${classes.join('.')}`;
      }
      return element.tagName;
    }

    const elements = [];
    const allTextElements = document.querySelectorAll('button, a, span, p, label, h1, h2, h3, td, th, li');

    allTextElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 2 && text.length < 200) {
        const rect = el.getBoundingClientRect();
        elements.push({
          text,
          container_width: el.offsetWidth,
          text_width: 0,
          scroll_width: el.scrollWidth,
          offset_width: el.offsetWidth,
          selector: getSelector(el),
        });
      }
    });

    return elements;
  });

  // 模拟不同语言的文本长度膨胀
  const languageMultipliers = {
    'zh-CN': 1.0,   // 中文基准
    'en': 1.4,      // 英文通常比中文长 40%
    'de': 1.6,      // 德文通常比中文长 60%
    'ru': 1.5,      // 俄文通常比中文长 50%
    'ja': 1.0,      // 日文与中文相似
  };

  for (const [lang, multiplier] of Object.entries(languageMultipliers)) {
    const overflows = [];

    textElements.forEach(el => {
      // 估算翻译后的文本宽度
      const estimatedWidth = el.container_width * multiplier * 0.6; // 0.6 是字符平均宽度系数
      const actualOverflow = el.scroll_width - el.offset_width;

      if (actualOverflow > 0 || estimatedWidth > el.container_width) {
        overflows.push({
          text: el.text,
          language: lang,
          multiplier,
          container_width: Math.round(el.container_width),
          estimated_width: Math.round(estimatedWidth),
          actual_overflow: Math.round(actualOverflow),
          selector: el.selector,
          severity: actualOverflow > 20 ? 'error' : 'warning',
        });
      }
    });

    results.push({
      language: lang,
      multiplier,
      overflow_count: overflows.length,
      overflows: overflows.slice(0, 10), // 限制数量
    });
  }

  return results;
}

/**
 * 获取元素的 CSS 选择器
 */
function getSelector(element) {
  if (element.id) return `#${element.id}`;
  if (element.className) {
    const classes = element.className.split(' ').filter(c => c && !c.startsWith('animate-') && !c.startsWith('group-')).slice(0, 3);
    if (classes.length > 0) return `${element.tagName}.${classes.join('.')}`;
  }
  return element.tagName;
}

// ========================================
// 6. 代码修复建议生成 (Code Fix Suggestions)
// ========================================

/**
 * 根据分析结果生成代码修复建议
 */
export function generateFixSuggestions(analyses, pageName) {
  const suggestions = [];

  // 布局问题修复
  if (analyses.layout?.issues) {
    analyses.layout.issues.forEach(issue => {
      switch (issue.type) {
        case 'overlapping_elements':
          suggestions.push({
            type: 'layout',
            severity: issue.severity,
            title: '修复元素重叠',
            description: issue.message,
            fix: '检查 CSS z-index 和 position 属性，确保元素不重叠',
            code_suggestion: `/* 为重叠元素添加适当的 z-index */
.element-1 {
  z-index: 10;
  position: relative;
}
.element-2 {
  z-index: 5;
  position: relative;
}`,
          });
          break;

        case 'horizontal_scroll':
          suggestions.push({
            type: 'layout',
            severity: issue.severity,
            title: '修复水平滚动',
            description: issue.message,
            fix: '使用响应式布局和 flex-wrap，避免固定宽度',
            code_suggestion: `/* 替换固定宽度为响应式布局 */
.container {
  width: 100%;
  max-width: 1280px;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* 或使用容器查询 */
@container (max-width: 768px) {
  .container {
    flex-direction: column;
  }
}`,
          });
          break;
      }
    });
  }

  // 按钮问题修复
  if (analyses.buttons?.duplicates) {
    analyses.buttons.duplicates.forEach(dup => {
      suggestions.push({
        type: 'buttons',
        severity: 'warning',
        title: `移除重复按钮: "${dup.text}"`,
        description: dup.message,
        fix: `合并重复的 "${dup.text}" 按钮，或使用不同文案区分功能`,
        code_suggestion: `// 使用统一的按钮组件
<Button>保存</Button>

// 如果需要区分功能，使用不同文案
<Button>保存并关闭</Button>
<Button>保存并继续</Button>`,
      });
    });
  }

  // 对比度问题修复
  if (analyses.colors?.contrast_issues) {
    analyses.colors.contrast_issues.slice(0, 3).forEach(ci => {
      suggestions.push({
        type: 'accessibility',
        severity: ci.severity,
        title: `修复对比度不足: ${ci.element}`,
        description: `文本 "${ci.text}" 对比度 ${ci.ratio}:1，需要 ${ci.required}`,
        fix: '增加文本颜色与背景色的对比度',
        code_suggestion: `/* 使用更高对比度的颜色 */
${ci.element.toLowerCase()} {
  color: oklch(30% 0.02 70); /* 更深的文字颜色 */
  /* 或调整背景色 */
  background-color: oklch(98% 0.005 70); /* 更浅的背景 */
}`,
      });
    });
  }

  // WCAG 问题修复
  if (analyses.wcag?.violations) {
    analyses.wcag.violations.forEach(v => {
      switch (v.rule) {
        case 'image-alt':
          suggestions.push({
            type: 'accessibility',
            severity: 'error',
            title: '添加图片 alt 文本',
            description: v.message,
            fix: '为所有图片添加描述性 alt 文本',
            code_suggestion: `<img src="..." alt="描述图片内容" />

/* 或装饰性图片 */
<img src="..." alt="" aria-hidden="true" />`,
          });
          break;

        case 'form-label':
          suggestions.push({
            type: 'accessibility',
            severity: 'error',
            title: '添加表单标签',
            description: v.message,
            fix: '为表单元素添加 label 或使用 aria-label',
            code_suggestion: `<label htmlFor="email">邮箱</label>
<input id="email" type="email" />

/* 或使用 aria-label */
<input type="email" aria-label="邮箱地址" />`,
          });
          break;

        case 'heading-level':
          suggestions.push({
            type: 'accessibility',
            severity: 'warning',
            title: '修复标题层级',
            description: v.message,
            fix: '确保标题层级连续，不跳过级别',
            code_suggestion: `<h1>页面标题</h1>
  <h2>章节标题</h2>    {/* 正确 */}
  <h3>子章节</h3>        {/* 正确 */}
  
  {/* 错误：跳过 h2 */}
  <h4>这会导致层级跳跃</h4>`,
          });
          break;
      }
    });
  }

  // 信息密度修复
  if (analyses.density?.suggestions) {
    analyses.density.suggestions.forEach(s => {
      switch (s.type) {
        case 'low_density':
          suggestions.push({
            type: 'design',
            severity: 'info',
            title: '提升信息密度',
            description: s.message,
            fix: '减少不必要的留白，使用更紧凑的布局',
            code_suggestion: `/* 减少间距 */
.container {
  gap: 0.5rem; /* 从 1rem 减少 */
  padding: 1rem; /* 从 2rem 减少 */
}

/* 或使用更紧凑的卡片 */
.card {
  padding: 0.75rem;
}`,
          });
          break;

        case 'high_density':
          suggestions.push({
            type: 'design',
            severity: 'warning',
            title: '降低信息密度',
            description: s.message,
            fix: '增加留白，使用折叠/分页，或拆分为多个页面',
            code_suggestion: `/* 增加留白 */
.container {
  gap: 1.5rem;
  padding: 2rem;
}

/* 使用折叠面板 */
<Collapsible>
  <CollapsibleTrigger>查看更多</CollapsibleTrigger>
  <CollapsibleContent>
    {/* 更多内容 */}
  </CollapsibleContent>
</Collapsible>`,
          });
          break;
      }
    });
  }

  // 国际化修复
  if (analyses.i18n) {
    analyses.i18n.forEach(lang => {
      if (lang.overflow_count > 0) {
        suggestions.push({
          type: 'i18n',
          severity: 'warning',
          title: `修复 ${lang.language} 文本溢出`,
          description: `${lang.language} 有 ${lang.overflow_count} 处文本可能溢出`,
          fix: '使用文本截断、自适应容器或换行',
          code_suggestion: `/* 文本截断 */
.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 自适应容器 */
.responsive-text {
  min-width: 0;
  word-break: break-word;
}

/* 或使用 Tailwind */
<div className="truncate">可能很长的文本</div>
<div className="min-w-0 break-words">自适应文本</div>`,
        });
      }
    });
  }

  return suggestions.sort((a, b) => {
    const severity = { error: 0, warning: 1, info: 2 };
    return severity[a.severity] - severity[b.severity];
  });
}

/**
 * 生成修复建议报告
 */
export function generateFixReport(suggestions) {
  let report = `# UI 修复建议报告\n\n`;
  report += `**生成时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;
  report += `**总建议数**: ${suggestions.length}\n`;
  report += `- 错误: ${suggestions.filter(s => s.severity === 'error').length}\n`;
  report += `- 警告: ${suggestions.filter(s => s.severity === 'warning').length}\n`;
  report += `- 信息: ${suggestions.filter(s => s.severity === 'info').length}\n\n`;

  report += `---\n\n`;

  suggestions.forEach((suggestion, index) => {
    const icon = suggestion.severity === 'error' ? '🔴' : suggestion.severity === 'warning' ? '🟡' : '🟢';
    report += `## ${index + 1}. ${icon} ${suggestion.title}\n\n`;
    report += `- **类型**: ${suggestion.type}\n`;
    report += `- **严重程度**: ${suggestion.severity}\n`;
    report += `- **描述**: ${suggestion.description}\n`;
    report += `- **修复方法**: ${suggestion.fix}\n\n`;

    if (suggestion.code_suggestion) {
      report += `### 代码示例\n\n`;
      report += '```jsx\n' + suggestion.code_suggestion + '\n```\n\n';
    }

    report += `---\n\n`;
  });

  return report;
}
