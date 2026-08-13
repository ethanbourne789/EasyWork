import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { useTasks } from "@/features/tasks/useTasks";
import { getMonday } from "@/lib/utils";
import { formatDateLocal } from "@/lib/dateUtils";

export function TaskTrendChart() {
  const { data: tasks = [] } = useTasks();

  // 统计本周每天完成的任务数（以周一为起点）
  const weekStart = getMonday();

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  // 使用本地日期格式化，避免 toISOString (UTC) 在 UTC+8 跨零点时产生 off-by-one
  const toLocalKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const data = weekDays.map((date) => {
    const dateStr = toLocalKey(date);
    const completedTasks = tasks.filter((task) => {
      if (task.status !== "done" || !task.updated_at) return false;
      const taskDate = toLocalKey(new Date(task.updated_at));
      return taskDate === dateStr;
    }).length;

    return {
      day: formatDateLocal(date),
      done: completedTasks,
    };
  });

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">本周任务完成趋势</h2>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="done" fill="hsl(var(--primary))" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
