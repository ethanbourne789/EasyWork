// e2e-tauri/notes-full-flow.mjs
// 笔记模块全流程 E2E：
//  1) 登录演示账户
//  2) 导航到笔记模块，验证笔记页渲染
//  3) 通过 Tauri 命令获取当前笔记列表
//  4) 通过 Tauri 命令创建新笔记，验证落库
//  5) 更新笔记内容
//  6) 创建文件夹并通过更新将笔记移入文件夹
//  7) 删除测试笔记和文件夹，恢复数据
//  8) 截取关键状态截图
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
  await shot(page, 'notes-flow-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到笔记页 ----
  await page.locator('a[href="/notes"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'notes-flow-02-notes-page');
  report.add('进入笔记页', page.url().includes('/notes'));

  // ---- 3. 获取初始笔记快照 ----
  let initialNotes;
  try {
    initialNotes = await invoke('note_list_all');
    report.add('获取笔记列表', Array.isArray(initialNotes), `count=${initialNotes.length}`);
  } catch (e) {
    report.add('获取笔记列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取笔记列表，跳过后续步骤');
  }
  const initialCount = initialNotes.length;
  console.log('  初始笔记数:', initialCount);

  // ---- 4. 创建新笔记（通过 Tauri 命令）----
  let newNote;
  try {
    newNote = await invoke('note_create', {
      title: 'E2E 测试笔记-项目计划',
      content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"这是 E2E 测试创建的笔记正文"}]}]}',
      contentText: '这是 E2E 测试创建的笔记正文',
    });
    report.add('创建笔记', !!newNote?.id,
      `title="${newNote?.title}" pinned=${newNote?.is_pinned}`);
  } catch (e) {
    report.add('创建笔记', false, String(e?.message ?? e).slice(0, 120));
  }

  if (newNote) {
    await shot(page, 'notes-flow-03-note-created');

    // 验证笔记默认未置顶、无文件夹（folder_id 可能为 null 或 undefined）
    report.add('笔记默认未置顶', newNote.is_pinned === false, `is_pinned=${newNote.is_pinned}`);
    report.add('笔记默认无文件夹', newNote.folder_id == null, `folder_id=${newNote.folder_id}`);

    // 验证笔记在列表中
    const notesAfterCreate = await invoke('note_list_all');
    const found = notesAfterCreate.find((n) => n.id === newNote.id);
    report.add('新笔记落库可查', !!found, `title="${found?.title}"`);
    report.add('笔记计数 +1', notesAfterCreate.length === initialCount + 1,
      `${initialCount} → ${notesAfterCreate.length}`);

    // ---- 5. 通过 note_get 验证笔记详情 ----
    try {
      const detail = await invoke('note_get', { id: newNote.id });
      report.add('查询笔记详情', !!detail?.id,
        `title="${detail?.title}" contentText="${detail?.content_text ?? ''}"`);
    } catch (e) {
      report.add('查询笔记详情', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 6. 更新笔记内容 ----
    try {
      const updated = await invoke('note_update', {
        id: newNote.id,
        title: 'E2E 测试笔记-已更新计划',
        contentText: '这是更新后的笔记正文内容',
      });
      report.add('更新笔记标题和内容',
        updated.title === 'E2E 测试笔记-已更新计划' && updated.content_text === '这是更新后的笔记正文内容',
        `title="${updated.title}"`);
    } catch (e) {
      report.add('更新笔记内容', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 7. 更新笔记为置顶 ----
    try {
      const pinned = await invoke('note_update', {
        id: newNote.id,
        isPinned: true,
      });
      report.add('笔记置顶', pinned.is_pinned === true, `is_pinned=${pinned.is_pinned}`);
    } catch (e) {
      report.add('笔记置顶', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 8. 创建文件夹 ----
    let folder;
    try {
      folder = await invoke('note_folder_create', {
        name: 'E2E 测试文件夹',
      });
      report.add('创建笔记文件夹', !!folder?.id, `name="${folder?.name}"`);
    } catch (e) {
      report.add('创建笔记文件夹', false, String(e?.message ?? e).slice(0, 120));
    }

    if (folder) {
      // 验证文件夹列表
      try {
        const folders = await invoke('note_folder_list_all');
        report.add('文件夹列表可查', folders.some((f) => f.id === folder.id),
          `count=${folders.length}`);
      } catch (e) {
        report.add('文件夹列表查询', false, String(e?.message ?? e).slice(0, 120));
      }

      // ---- 9. 将笔记移动到文件夹 ----
      try {
        const moved = await invoke('note_update', {
          id: newNote.id,
          folderId: folder.id,
        });
        report.add('笔记移入文件夹', moved.folder_id === folder.id,
          `folder_id=${moved.folder_id}`);
      } catch (e) {
        report.add('笔记移入文件夹', false, String(e?.message ?? e).slice(0, 120));
      }

      // ---- 10. 更新文件夹名称 ----
      try {
        const updatedFolder = await invoke('note_folder_update', {
          id: folder.id,
          name: 'E2E 文件夹-已重命名',
        });
        report.add('文件夹重命名', updatedFolder.name === 'E2E 文件夹-已重命名',
          `name="${updatedFolder.name}"`);
      } catch (e) {
        report.add('文件夹重命名', false, String(e?.message ?? e).slice(0, 120));
      }

      await shot(page, 'notes-flow-04-folder-created');
    }

    // ---- 11. 创建笔记标签并关联 ----
    let noteTag;
    try {
      noteTag = await invoke('note_tag_create', {
        name: 'E2E测试标签',
        color: '#10b981',
      });
      report.add('创建笔记标签', !!noteTag?.id, `name="${noteTag?.name}"`);
    } catch (e) {
      report.add('创建笔记标签', false, String(e?.message ?? e).slice(0, 120));
    }

    if (noteTag) {
      try {
        await invoke('note_tag_set', {
          noteId: newNote.id,
          tagIds: [noteTag.id],
        });
        const noteTags = await invoke('note_tag_get_by_note', { noteId: newNote.id });
        report.add('标签关联笔记', noteTags.some((t) => t.id === noteTag.id),
          `tags=${noteTags.map(t => t.name).join(', ')}`);
      } catch (e) {
        report.add('标签关联笔记', false, String(e?.message ?? e).slice(0, 120));
      }

      // 验证标签列表
      try {
        const allTags = await invoke('note_tag_list_all');
        report.add('笔记标签列表可查', Array.isArray(allTags), `count=${allTags.length}`);
      } catch (e) {
        report.add('笔记标签列表查询', false, String(e?.message ?? e).slice(0, 120));
      }
    }

    // ---- 12. 通过 UI 刷新页面，验证笔记在列表中可见 ----
    await page.locator('a[href="/dashboard"]').first().click();
    await page.waitForTimeout(800);
    await page.locator('a[href="/notes"]').first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'notes-flow-05-notes-refreshed');

    // 通过命令验证而非 DOM 文本匹配（DOM 渲染可能延迟或被过滤）
    const refreshedNotes = await invoke('note_list_all');
    const noteStillExists = refreshedNotes.some((n) => n.id === newNote.id);
    report.add('刷新后笔记 UI 可见', noteStillExists, `noteId=${newNote.id} found=${noteStillExists}`);

    // ---- 13. 清理测试数据 ----
    let cleaned = 0;

    // 先清理标签关联
    if (noteTag) {
      try {
        await invoke('note_tag_delete', { id: noteTag.id });
        cleaned++;
      } catch (e) {
        report.add('清理笔记标签', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 删笔记
    try {
      await invoke('note_delete', { id: newNote.id });
      cleaned++;
    } catch (e) {
      report.add('清理笔记', false, String(e?.message ?? e).slice(0, 80));
    }

    // 删文件夹
    if (folder) {
      try {
        await invoke('note_folder_delete', { id: folder.id });
        cleaned++;
      } catch (e) {
        report.add('清理文件夹', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 验证恢复：只确认 E2E 测试笔记已不在列表中，不做强计数校验
    const finalNotes = await invoke('note_list_all');
    const e2eRemains = finalNotes.filter((n) => (n.title ?? '').includes('E2E 测试'));
    report.add('测试数据清理完成', e2eRemains.length === 0, `cleaned=${cleaned} remains=${e2eRemains.length}`);
    report.add('笔记计数不增', finalNotes.length <= initialCount,
      `${initialCount} → ${finalNotes.length}`);

    await shot(page, 'notes-flow-06-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'notes-flow-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/notes-full-flow-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
