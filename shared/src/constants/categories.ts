// shared/src/constants/categories.ts

/** 记账支出分类 */
export const EXPENSE_CATEGORIES = [
  '餐饮', '交通', '购物', '娱乐', '医疗', '教育', '居住', '通讯', '其他',
] as const;

/** 记账收入分类 */
export const INCOME_CATEGORIES = [
  '工资', '奖金', '投资收益', '兼职', '红包', '其他',
] as const;

/** 运动类型标签 */
export const SPORT_TYPE_LABELS: Record<string, string> = {
  running: '跑步',
  cycling: '骑行',
  fitness: '健身',
  ball_game: '球类运动',
};

/** 任务状态标签 */
export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
  abandoned: '已放弃',
  archived: '归档',
};

/** 优先级标签 */
export const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 优先级颜色 */
export const PRIORITY_COLORS: Record<string, string> = {
  high: '#FF6B6B',
  medium: '#FFD43B',
  low: '#51CF66',
};
