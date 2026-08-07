import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { day: "周一", done: 3 },
  { day: "周二", done: 5 },
  { day: "周三", done: 2 },
  { day: "周四", done: 7 },
  { day: "周五", done: 4 },
  { day: "周六", done: 1 },
  { day: "周日", done: 0 },
];

export function TaskTrendChart() {
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