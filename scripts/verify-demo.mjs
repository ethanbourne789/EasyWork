// 端到端验证：演示账号登录 + RLS 读取种子数据
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.VITE_DEMO_EMAIL;
const PASSWORD = process.env.VITE_DEMO_PASSWORD;

const missing = [
  ['VITE_SUPABASE_URL', URL],
  ['VITE_SUPABASE_ANON_KEY', ANON],
  ['VITE_DEMO_EMAIL', EMAIL],
  ['VITE_DEMO_PASSWORD', PASSWORD],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error('缺少必需的环境变量: ' + missing.join(', '));
  console.error('请先加载本地 .env（例如: node --env-file=.env scripts/verify-demo.mjs）或手动 export 这些变量。');
  process.exit(1);
}

const sb = createClient(URL, ANON);

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
if (authErr) {
  console.error('登录失败:');
  console.error('  message =', authErr.message);
  console.error('  status  =', authErr.status);
  console.error('  code    =', authErr.code);
  console.error('  full    =', JSON.stringify(authErr));
  process.exit(1);
}
console.log('✅ 演示账号登录成功, user_id =', auth.user.id);

const count = async (table) => {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count;
};

try {
  const accounts = await count('accounts');
  const categories = await count('categories');
  const transactions = await count('transactions');
  const budgets = await count('budgets');
  console.log('📊 行数统计:');
  console.log('   accounts     =', accounts);
  console.log('   categories   =', categories);
  console.log('   transactions =', transactions);
  console.log('   budgets      =', budgets);

  // 抽样：整体预算 + 一级分类
  const { data: overall } = await sb.from('budgets').select('*').eq('scope', 'overall');
  const { data: topCats } = await sb.from('categories').select('id,name,parent_id').is('parent_id', null);
  console.log('   overall budget =', JSON.stringify(overall));
  console.log('   top categories =', topCats.map(c => c.name).join(', '));
  console.log('✅ 验证通过：种子数据已写入且演示账号可正常读取');
} catch (e) {
  console.error('查询失败:', e.message);
  process.exit(1);
}
