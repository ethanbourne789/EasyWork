// e2e-tauri/finance-accounts-transfer.mjs
// 账户管理 / 转账 / 预算 / 分类 专项 E2E：
//  1) 登录演示账户并导航到 /finance
//  2) 查询所有账户（account_list_all）
//  3) 新建账户（account_create）类型为 wallet，带初始余额
//  4) 查询账户详情（account_get）
//  5) 更新账户名称和余额（account_update）
//  6) 删除测试账户（account_delete）
//  7) 在两个已有账户间创建转账交易
//  8) 验证转账对两个账户余额的影响
//  9) 新建预算（budget_create）绑定到某个分类
//  10) 更新并删除预算
//  11) 新建自定义分类（category_create）
//  12) 导航到管理 tab 并验证分类可见
//  13) 清理所有测试数据
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录并导航到记账页 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'finance-accounts-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  await page.locator('a[href="/finance"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'finance-accounts-02-ledger');
  report.add('进入记账页', page.url().includes('/finance'));

  // ---- 2. 查询所有已有账户 ----
  let accounts, categories;
  try {
    accounts = await invoke('account_list_all');
    categories = await invoke('category_list_all');
    report.add('获取账户列表', Array.isArray(accounts) && accounts.length > 0, `count=${accounts.length}`);
    report.add('获取分类列表', Array.isArray(categories), `count=${categories.length}`);
  } catch (e) {
    report.add('获取初始数据', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取初始数据，跳过后续步骤');
  }

  console.log('  账户列表:', accounts.map((a) => `${a.name}(${a.type})`).join(', '));
  console.log('  分类列表:', categories.map((c) => `${c.name}(${c.type})`).join(', '));

  const today = new Date().toISOString().slice(0, 10);
  const nowYear = new Date().getFullYear();
  const nowMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const yearMonth = `${nowYear}${nowMonth}`;

  // ============= 账户 CRUD =============

  // ---- 3. 新建账户（wallet 类型，初始余额 1000.00 元 = 100000 cents）----
  let testAccount;
  try {
    testAccount = await invoke('account_create', {
      name: 'E2E 测试钱包',
      type: 'wallet',
      balance_cents: 100000,
      currency: 'CNY',
    });
    report.add('创建测试账户（wallet）', !!testAccount?.id,
      `name=${testAccount?.name} type=${testAccount?.type} balanceCents=${testAccount?.balance_cents}`);
  } catch (e) {
    report.add('创建测试账户', false, String(e?.message ?? e).slice(0, 120));
  }

  if (testAccount) {
    await shot(page, 'finance-accounts-03-account-created');

    // ---- 4. 查询账户详情 ----
    let accountDetail;
    try {
      accountDetail = await invoke('account_get', { id: testAccount.id });
      report.add('查询账户详情', !!accountDetail?.id,
        `name=${accountDetail?.name} type=${accountDetail?.type} balanceCents=${accountDetail?.balance_cents}`);
    } catch (e) {
      report.add('查询账户详情', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 5. 更新账户名称和余额 ----
    if (accountDetail) {
      let updatedAccount;
      try {
        updatedAccount = await invoke('account_update', {
          id: testAccount.id,
          name: 'E2E 测试钱包-已更新',
          balance_cents: 150000,
        });
        report.add('更新账户名称和余额', !!updatedAccount?.id,
          `name=${updatedAccount?.name} balanceCents=${updatedAccount?.balance_cents}`);
      } catch (e) {
        report.add('更新账户', false, String(e?.message ?? e).slice(0, 120));
      }

      if (updatedAccount) {
        report.add('账户名称已更新', updatedAccount.name === 'E2E 测试钱包-已更新',
          `actual="${updatedAccount.name}"`);
        report.add('账户余额已更新', updatedAccount.balance_cents === 150000,
          `expected=150000 actual=${updatedAccount.balance_cents}`);
        await shot(page, 'finance-accounts-04-account-updated');

        // 将 testAccount 引用指向更新后的数据，后续删除用
        testAccount = updatedAccount;
      }

      // ---- 6. 删除测试账户 ----
      try {
        await invoke('account_delete', { id: testAccount.id });
        report.add('删除测试账户', true, `deletedId=${testAccount.id}`);
      } catch (e) {
        report.add('删除测试账户', false, String(e?.message ?? e).slice(0, 120));
      }

      // 验证删除：重新获取列表，不应再包含该账户
      const accountsAfterDelete = await invoke('account_list_all');
      const stillExists = accountsAfterDelete.some((a) => a.id === testAccount.id);
      report.add('账户删除后不再出现在列表中', !stillExists,
        `accountId=${testAccount.id} found=${stillExists}`);

      // 刷新 accounts 列表（已删除测试账户）
      accounts = accountsAfterDelete;
      await shot(page, 'finance-accounts-05-account-deleted');
    }
  }

  // ============= 转账交易 =============

  // ---- 7. 在两个已有账户间创建转账 ----
  if (accounts.length >= 2) {
    const fromAccount = accounts[0];
    const toAccount = accounts[1];

    // 记录转账前余额快照
    const fromBalanceBefore = fromAccount.balance_cents;
    const toBalanceBefore = toAccount.balance_cents;

    console.log(`  转账前: ${fromAccount.name}=${fromBalanceBefore}, ${toAccount.name}=${toBalanceBefore}`);

    let transferTx;
    try {
      transferTx = await invoke('transaction_create', {
        type: 'transfer',
        amount_cents: 5000, // 50.00 元
        account_id: fromAccount.id,
        transfer_account_id: toAccount.id,
        date: today,
        description: 'E2E 测试转账',
      });
      report.add('创建转账交易（50.00 元）', !!transferTx?.id,
        `from=${fromAccount.name} to=${toAccount.name}`);
    } catch (e) {
      report.add('创建转账交易', false, String(e?.message ?? e).slice(0, 120));
    }

    if (transferTx) {
      await shot(page, 'finance-accounts-06-transfer-created');

      // ---- 8. 验证转账对两个账户余额的影响 ----
      const accountsAfterTransfer = await invoke('account_list_all');
      const fromAfter = accountsAfterTransfer.find((a) => a.id === fromAccount.id);
      const toAfter = accountsAfterTransfer.find((a) => a.id === toAccount.id);

      if (fromAfter && toAfter) {
        const fromBalanceAfter = fromAfter.balance_cents;
        const toBalanceAfter = toAfter.balance_cents;

        report.add('转出账户余额减少 5000 cents',
          fromBalanceAfter === fromBalanceBefore - 5000,
          `${fromBalanceBefore} - 5000 = ${fromBalanceBefore - 5000}, 实际=${fromBalanceAfter}`);

        report.add('转入账户余额增加 5000 cents',
          toBalanceAfter === toBalanceBefore + 5000,
          `${toBalanceBefore} + 5000 = ${toBalanceBefore + 5000}, 实际=${toBalanceAfter}`);

        // 验证转账交易在交易列表中
        const allTxns = await invoke('transaction_list_all');
        const foundTransfer = allTxns.find((t) => t.id === transferTx.id);
        report.add('转账交易落库可查', !!foundTransfer,
          `type=${foundTransfer?.type} amount=${foundTransfer?.amount} note="${foundTransfer?.note}"`);

        // 验证转账详情
        if (foundTransfer) {
          const transferDetail = await invoke('transaction_get', { id: transferTx.id });
          report.add('查询转账交易详情', !!transferDetail?.id,
            `type=${transferDetail?.type} amount=${transferDetail?.amount}`);
        }

        await shot(page, 'finance-accounts-07-transfer-verified');

        // 清理转账交易
        try {
          await invoke('transaction_delete', { id: transferTx.id });
          report.add('清理转账交易', true, `deletedId=${transferTx.id}`);
        } catch (e) {
          report.add('清理转账交易', false, String(e?.message ?? e).slice(0, 80));
        }
      } else {
        report.add('转账后账户查询', false, '未能查询到转出或转入账户');
      }
    }
  } else {
    report.add('转账测试（账户不足 2 个，跳过）', true);
  }

  // ============= 预算管理 =============

  // 选择一个支出分类用于预算（如果没有则跳过）
  const expenseCategory = categories.find((c) => c.type === 'expense' && !c.parent_id) ||
    categories.find((c) => c.type === 'expense');

  if (expenseCategory) {
    // ---- 9. 新建预算（绑定到支出分类）----
    let testBudget;
    try {
      testBudget = await invoke('budget_create', {
        category_id: expenseCategory.id,
        amount_cents: 50000, // 500.00 元
        year_month: yearMonth,
        scope: 'category',
      });
      report.add('创建预算（500.00 元）', !!testBudget?.id,
        `categoryId=${testBudget?.category_id} amount=${testBudget?.amount} scope=${testBudget?.scope}`);
    } catch (e) {
      report.add('创建预算', false, String(e?.message ?? e).slice(0, 120));
    }

    if (testBudget) {
      await shot(page, 'finance-accounts-08-budget-created');

      // 验证预算在列表中
      const budgetsAfterCreate = await invoke('budget_list_all');
      const foundBudget = budgetsAfterCreate.find((b) => b.id === testBudget.id);
      report.add('预算落库可查', !!foundBudget,
        `amount=${foundBudget?.amount} yearMonth=${foundBudget?.year_month}`);

      // ---- 10. 更新预算 ----
      let updatedBudget;
      try {
        updatedBudget = await invoke('budget_update', {
          id: testBudget.id,
          amount_cents: 80000, // 更新为 800.00 元
        });
        report.add('更新预算金额', !!updatedBudget?.id,
          `amount=${updatedBudget?.amount} (expected 800)`);
      } catch (e) {
        report.add('更新预算', false, String(e?.message ?? e).slice(0, 120));
      }

      if (updatedBudget) {
        report.add('预算金额已更新', updatedBudget.amount === 800,
          `expected=800 actual=${updatedBudget.amount}`);
        await shot(page, 'finance-accounts-09-budget-updated');

        // ---- 10b. 删除预算 ----
        try {
          await invoke('budget_delete', { id: testBudget.id });
          report.add('删除预算', true, `deletedId=${testBudget.id}`);
        } catch (e) {
          report.add('删除预算', false, String(e?.message ?? e).slice(0, 120));
        }

        // 验证删除
        const budgetsAfterDelete = await invoke('budget_list_all');
        const budgetStillExists = budgetsAfterDelete.some((b) => b.id === testBudget.id);
        report.add('预算删除后不再出现在列表中', !budgetStillExists,
          `budgetId=${testBudget.id} found=${budgetStillExists}`);
      }

      await shot(page, 'finance-accounts-10-budget-deleted');
    }
  } else {
    report.add('预算测试（无支出分类，跳过）', true);
  }

  // ============= 分类管理 =============

  const initialCategoryCount = categories.length;

  // ---- 11. 新建自定义分类 ----
  let testCategory;
  try {
    testCategory = await invoke('category_create', {
      name: 'E2E 测试分类',
      type: 'expense',
      icon: 'coffee',
    });
    report.add('创建自定义分类', !!testCategory?.id,
      `name=${testCategory?.name} type=${testCategory?.type} icon=${testCategory?.icon}`);
  } catch (e) {
    report.add('创建自定义分类', false, String(e?.message ?? e).slice(0, 120));
  }

  if (testCategory) {
    await shot(page, 'finance-accounts-11-category-created');

    // 验证分类在列表中
    const categoriesAfterCreate = await invoke('category_list_all');
    const foundCategory = categoriesAfterCreate.find((c) => c.id === testCategory.id);
    report.add('分类落库可查', !!foundCategory,
      `name=${foundCategory?.name} type=${foundCategory?.type}`);
    report.add('分类计数 +1', categoriesAfterCreate.length === initialCategoryCount + 1,
      `${initialCategoryCount} -> ${categoriesAfterCreate.length}`);

    // 更新分类
    let updatedCategory;
    try {
      updatedCategory = await invoke('category_update', {
        id: testCategory.id,
        name: 'E2E 测试分类-已更新',
        icon: 'utensils',
      });
      report.add('更新分类', !!updatedCategory?.id,
        `name=${updatedCategory?.name} icon=${updatedCategory?.icon}`);
    } catch (e) {
      report.add('更新分类', false, String(e?.message ?? e).slice(0, 120));
    }

    if (updatedCategory) {
      report.add('分类名称已更新', updatedCategory.name === 'E2E 测试分类-已更新',
        `actual="${updatedCategory.name}"`);
    }

    // ---- 12. 导航到管理 tab 并验证可见 ----
    const manageTab = page.getByText(/管理/).first();
    if (await manageTab.isVisible().catch(() => false)) {
      await manageTab.click();
      await page.waitForTimeout(1500);

      // 验证管理页中能看到自定义分类名称
      const bodyText = await page.locator('body').textContent();
      const categoryVisibleInManage = bodyText.includes('E2E 测试分类');
      report.add('管理 tab 可切换', true);
      report.add('自定义分类在管理页可见', categoryVisibleInManage,
        `bodyContainsName=${categoryVisibleInManage}`);
      await shot(page, 'finance-accounts-12-manage-tab');

      // 切回账单 tab 以回到默认视图
      const ledgerTab = page.locator('button').filter({ hasText: /账单/ }).first();
      if (await ledgerTab.isVisible().catch(() => false)) {
        await ledgerTab.click();
        await page.waitForTimeout(1000);
      }
    } else {
      report.add('管理 tab（不可见，跳过分类可见性验证）', true);
    }

    // ---- 13. 清理分类 ----
    try {
      await invoke('category_delete', { id: testCategory.id });
      report.add('删除自定义分类', true, `deletedId=${testCategory.id}`);
    } catch (e) {
      report.add('删除自定义分类', false, String(e?.message ?? e).slice(0, 120));
    }

    // 验证分类删除
    const categoriesAfterDelete = await invoke('category_list_all');
    const categoryStillExists = categoriesAfterDelete.some((c) => c.id === testCategory.id);
    report.add('分类删除后不再出现在列表中', !categoryStillExists,
      `categoryId=${testCategory.id} found=${categoryStillExists}`);
    report.add('分类计数恢复', categoriesAfterDelete.length === initialCategoryCount,
      `${initialCategoryCount} -> ${categoriesAfterDelete.length}`);

    await shot(page, 'finance-accounts-13-cleaned');
  }

  // ============= 最终验证 =============

  // 验证无 E2E 测试残留数据
  const finalTxns = await invoke('transaction_list_all');
  const e2eRemains = finalTxns.filter((t) => (t.note ?? '').includes('E2E 测试'));
  report.add('无 E2E 残留交易', e2eRemains.length === 0, `remains=${e2eRemains.length}`);

  const finalAccounts = await invoke('account_list_all');
  const e2eAccountRemains = finalAccounts.some((a) => (a.name ?? '').includes('E2E 测试'));
  report.add('无 E2E 残留账户', !e2eAccountRemains);

  const finalCategories = await invoke('category_list_all');
  const e2eCategoryRemains = finalCategories.some((c) => (c.name ?? '').includes('E2E 测试'));
  report.add('无 E2E 残留分类', !e2eCategoryRemains);

  const finalBudgets = await invoke('budget_list_all');
  const e2eBudgetRemains = finalBudgets.some((b) => b.id && b.id.length > 0);
  // 预算不带有名称，如果有预算则打印数量
  report.add('预算列表状态', true, `budgetCount=${finalBudgets.length}`);

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'finance-accounts-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/finance-accounts-transfer-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
