import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { demoSportRecords } from "@/data/demo-data"
import { Plus, Flame, Timer, Route as RouteIcon, Target } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"

const sportIcons: Record<string, string> = {
  "跑步": "🏃",
  "力量训练": "🏋️",
  "游泳": "🏊",
  "骑行": "🚴",
  "瑜伽": "🧘",
}

const weeklySportData = [
  { day: "周一", calories: 430, minutes: 60 },
  { day: "周二", calories: 0, minutes: 0 },
  { day: "周三", calories: 320, minutes: 30 },
  { day: "周四", calories: 450, minutes: 60 },
  { day: "周五", calories: 680, minutes: 90 },
  { day: "周六", calories: 200, minutes: 60 },
  { day: "周日", calories: 400, minutes: 55 },
]

function SportsPage() {
  const totalCalories = demoSportRecords.reduce((s, r) => s + r.calories, 0)
  const totalMinutes = demoSportRecords.reduce((s, r) => s + r.duration, 0)
  const totalDistance = demoSportRecords.reduce((s, r) => s + r.distance, 0)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">运动</h1>
          <p className="text-surface-500 text-sm mt-1">本周运动记录</p>
        </div>
        <Button><Plus size={16} />添加记录</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">总消耗</p>
                <p className="text-xl font-bold mt-1">{totalCalories}<span className="text-sm font-normal text-surface-400 ml-1">kcal</span></p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Flame size={20} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">总时长</p>
                <p className="text-xl font-bold mt-1">{totalMinutes}<span className="text-sm font-normal text-surface-400 ml-1">分钟</span></p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Timer size={20} className="text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">总距离</p>
                <p className="text-xl font-bold mt-1">{totalDistance.toFixed(1)}<span className="text-sm font-normal text-surface-400 ml-1">km</span></p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <RouteIcon size={20} className="text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">运动次数</p>
                <p className="text-xl font-bold mt-1">{demoSportRecords.length}<span className="text-sm font-normal text-surface-400 ml-1">次</span></p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Target size={20} className="text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>本周卡路里消耗</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklySportData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} unit="kcal" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                  formatter={(v) => `${Number(v)} kcal`}
                />
                <Bar dataKey="calories" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Records */}
        <Card>
          <CardHeader><CardTitle>最近记录</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {demoSportRecords.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 transition-colors cursor-pointer border border-surface-100"
              >
                <span className="text-2xl">{sportIcons[record.type] || "🎯"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{record.type}</p>
                  <p className="text-xs text-surface-400">{record.date} · {record.notes}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-orange-600">{record.calories} kcal</p>
                  <p className="text-xs text-surface-400">{record.duration}分钟</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/sports")({
  component: SportsPage,
})
