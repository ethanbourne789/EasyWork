// e2e-tauri/notes-tags.mjs
// 笔记标签管理 E2E 验证：
//  1) 登录演示账户，导航到 /notes
//  2) 获取所有笔记标签（note_tag_list_all）
//  3) 创建多个标签（note_tag_create），使用不同颜色
//  4) 更新标签名称和颜色
//  5) 创建笔记并设置标签（note_tag_set）
//  6) 获取笔记的标签（note_tag_get_by_note）
//  7) 删除标签
//  8) 清理测试数据
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'notes-tags-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到笔记页 ----
  await page.locator('a[href="/notes"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'notes-tags-02-notes-page');
  report.add('进入笔记页', page.url().includes('/notes'));

  // ---- 3. 获取初始标签快照 ----
  let initialTags;
  try {
    initialTags = await invoke('note_tag_list_all');
    report.add('获取笔记标签列表', Array.isArray(initialTags), `count=${initialTags.length}`);
  } catch (e) {
    report.add('获取标签列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取标签列表，跳过后续步骤');
  }
  const initialTagCount = initialTags.length;
  console.log('  初始标签数量:', initialTagCount);

  // ---- 4. 获取初始笔记快照 ----
  let initialNotes;
  try {
    initialNotes = await invoke('note_list_all');
    report.add('获取笔记列表', Array.isArray(initialNotes), `count=${initialNotes.length}`);
  } catch (e) {
    report.add('获取笔记列表', false, String(e?.message ?? e).slice(0, 120));
  }
  const initialNoteCount = initialNotes.length;

  // ---- 5. 创建绿色标签 ----
  let tagGreen;
  try {
    tagGreen = await invoke('note_tag_create', {
      name: 'E2E 工作',
      color: '#10b981',
    });
    report.add('创建绿色标签', !!tagGreen?.id, `name="${tagGreen?.name}" color=${tagGreen?.color}`);
  } catch (e) {
    report.add('创建绿色标签', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 6. 创建蓝色标签 ----
  let tagBlue;
  try {
    tagBlue = await invoke('note_tag_create', {
      name: 'E2E 个人',
      color: '#3b82f6',
    });
    report.add('创建蓝色标签', !!tagBlue?.id, `name="${tagBlue?.name}" color=${tagBlue?.color}`);
  } catch (e) {
    report.add('创建蓝色标签', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 7. 创建黄色标签 ----
  let tagYellow;
  try {
    tagYellow = await invoke('note_tag_create', {
      name: 'E2E 重要',
      color: '#f59e0b',
    });
    report.add('创建黄色标签', !!tagYellow?.id, `name="${tagYellow?.name}" color=${tagYellow?.color}`);
  } catch (e) {
    report.add('创建黄色标签', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 8. 验证标签计数 +3 ----
  if (tagGreen && tagBlue && tagYellow) {
    const tagsAfterCreate = await invoke('note_tag_list_all');
    report.add('标签计数 +3', tagsAfterCreate.length === initialTagCount + 3,
      `${initialTagCount} → ${tagsAfterCreate.length}`);
    await shot(page, 'notes-tags-03-tags-created');
  }

  // ---- 9. 更新标签名称 ----
  if (tagGreen) {
    try {
      const updatedTag = await invoke('note_tag_update', {
        id: tagGreen.id,
        name: 'E2E 工作-已更新',
      });
      report.add('更新标签名称', updatedTag.name === 'E2E 工作-已更新',
        `name="${updatedTag.name}"`);
    } catch (e) {
      report.add('更新标签名称', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ---- 10. 更新标签颜色 ----
  if (tagBlue) {
    try {
      const updatedColor = await invoke('note_tag_update', {
        id: tagBlue.id,
        color: '#8b5cf6',
      });
      report.add('更新标签颜色', updatedColor.color === '#8b5cf6',
        `color=${updatedColor.color}`);
    } catch (e) {
      report.add('更新标签颜色', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ---- 11. 同时更新名称和颜色 ----
  if (tagYellow) {
    try {
      const fullyUpdated = await invoke('note_tag_update', {
        id: tagYellow.id,
        name: 'E2E 优先级',
        color: '#ef4444',
      });
      report.add('同时更新名称和颜色',
        fullyUpdated.name === 'E2E 优先级' && fullyUpdated.color === '#ef4444',
        `name="${fullyUpdated.name}" color=${fullyUpdated.color}`);
    } catch (e) {
      report.add('同时更新名称和颜色', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ---- 12. 创建测试笔记 ----
  let testNote;
  try {
    testNote = await invoke('note_create', {
      title: 'E2E 标签测试笔记',
      content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"这是用于测试标签功能的笔记"}]}]}',
      contentText: '这是用于测试标签功能的笔记',
    });
    report.add('创建测试笔记', !!testNote?.id, `title="${testNote?.title}"`);
  } catch (e) {
    report.add('创建测试笔记', false, String(e?.message ?? e).slice(0, 120));
  }

  if (testNote) {
    await shot(page, 'notes-tags-04-note-created');

    // ---- 13. 为笔记设置单个标签 ----
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [tagGreen.id],
      });
      const noteTags = await invoke('note_tag_get_by_note', { noteId: testNote.id });
      report.add('设置单个标签', noteTags.length === 1 && noteTags.some((t) => t.id === tagGreen.id),
        `tags=[${noteTags.map(t => t.name).join(', ')}]`);
    } catch (e) {
      report.add('设置单个标签', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 14. 为笔记设置多个标签 ----
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [tagGreen.id, tagBlue.id, tagYellow.id],
      });
      const noteTags = await invoke('note_tag_get_by_note', { noteId: testNote.id });
      report.add('设置多个标签',
        noteTags.length === 3 &&
        noteTags.some((t) => t.id === tagGreen.id) &&
        noteTags.some((t) => t.id === tagBlue.id) &&
        noteTags.some((t) => t.id === tagYellow.id),
        `tags=[${noteTags.map(t => `${t.name}(${t.color})`).join(', ')}]`);
    } catch (e) {
      report.add('设置多个标签', false, String(e?.message ?? e).slice(0, 120));
    }

    await shot(page, 'notes-tags-05-tags-assigned');

    // ---- 15. 替换笔记标签（只保留一个）----
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [tagBlue.id],
      });
      const noteTags = await invoke('note_tag_get_by_note', { noteId: testNote.id });
      report.add('替换标签集', noteTags.length === 1 && noteTags.some((t) => t.id === tagBlue.id),
        `tags=[${noteTags.map(t => t.name).join(', ')}]`);
    } catch (e) {
      report.add('替换标签集', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 16. 移除笔记所有标签 ----
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [],
      });
      const noteTags = await invoke('note_tag_get_by_note', { noteId: testNote.id });
      report.add('移除所有标签', noteTags.length === 0, `tags=${noteTags.length}`);
    } catch (e) {
      report.add('移除所有标签', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 17. 再次设置标签用于后续删除测试 ----
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [tagGreen.id, tagBlue.id],
      });
      const noteTags = await invoke('note_tag_get_by_note', { noteId: testNote.id });
      report.add('重新设置标签', noteTags.length === 2,
        `tags=[${noteTags.map(t => t.name).join(', ')}]`);
    } catch (e) {
      report.add('重新设置标签', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 18. 删除单个标签 ----
    if (tagYellow) {
      try {
        await invoke('note_tag_delete', { id: tagYellow.id });
        report.add('删除黄色标签', true);

        // 验证标签已不存在于全局列表
        const tagsAfterDelete = await invoke('note_tag_list_all');
        const tagYellowGone = !tagsAfterDelete.some((t) => t.id === tagYellow.id);
        report.add('黄色标签已移除', tagYellowGone, `remaining=${tagsAfterDelete.length}`);
      } catch (e) {
        report.add('删除黄色标签', false, String(e?.message ?? e).slice(0, 120));
      }
    }

    await shot(page, 'notes-tags-06-tag-deleted');

    // ---- 19. 创建第二条笔记并测试标签独立性 ----
    let testNote2;
    try {
      testNote2 = await invoke('note_create', {
        title: 'E2E 标签测试笔记 2',
        content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"第二条测试笔记"}]}]}',
        contentText: '第二条测试笔记',
      });
      report.add('创建第二条笔记', !!testNote2?.id, `title="${testNote2?.title}"`);
    } catch (e) {
      report.add('创建第二条笔记', false, String(e?.message ?? e).slice(0, 120));
    }

    if (testNote2) {
      // 给第二条笔记设置不同的标签
      try {
        await invoke('note_tag_set', {
          noteId: testNote2.id,
          tagIds: [tagGreen.id],
        });
        const tags1 = await invoke('note_tag_get_by_note', { noteId: testNote.id });
        const tags2 = await invoke('note_tag_get_by_note', { noteId: testNote2.id });
        report.add('笔记标签独立性',
          tags1.length === 2 && tags2.length === 1,
          `note1=${tags1.length}tags note2=${tags2.length}tags`);
      } catch (e) {
        report.add('笔记标签独立性', false, String(e?.message ?? e).slice(0, 120));
      }

      // 清理第二条笔记
      try {
        await invoke('note_delete', { id: testNote2.id });
      } catch (e) {
        report.add('清理第二条笔记', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // ---- 20. 清理测试数据 ----
    let cleaned = 0;

    // 先清除笔记的标签关联
    try {
      await invoke('note_tag_set', {
        noteId: testNote.id,
        tagIds: [],
      });
    } catch (e) { /* ignore cleanup errors */ }

    // 删标签
    if (tagGreen) {
      try {
        await invoke('note_tag_delete', { id: tagGreen.id });
        cleaned++;
      } catch (e) {
        report.add('清理绿色标签', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    if (tagBlue) {
      try {
        await invoke('note_tag_delete', { id: tagBlue.id });
        cleaned++;
      } catch (e) {
        report.add('清理蓝色标签', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 删笔记
    try {
      await invoke('note_delete', { id: testNote.id });
      cleaned++;
    } catch (e) {
      report.add('清理测试笔记', false, String(e?.message ?? e).slice(0, 80));
    }

    // 验证恢复
    const finalTags = await invoke('note_tag_list_all');
    const e2eTagRemains = finalTags.filter((t) => (t.name ?? '').includes('E2E'));
    report.add('标签清理完成', e2eTagRemains.length === 0, `remains=${e2eTagRemains.length}`);
    report.add('标签计数不增', finalTags.length <= initialTagCount,
      `${initialTagCount} → ${finalTags.length}`);

    const finalNotes = await invoke('note_list_all');
    const e2eNoteRemains = finalNotes.filter((n) => (n.title ?? '').includes('E2E'));
    report.add('笔记清理完成', e2eNoteRemains.length === 0, `remains=${e2eNoteRemains.length}`);
    report.add('笔记计数不增', finalNotes.length <= initialNoteCount,
      `${initialNoteCount} → ${finalNotes.length}`);

    await shot(page, 'notes-tags-07-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'notes-tags-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/notes-tags-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
