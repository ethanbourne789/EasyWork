import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { demoCalendarEvents } from "@/data/demo-data"
import { Plus, ChevronLeft, ChevronRight, Clock } from "lucide-react"

const eventTypeConfig = {
  meeting: { label: "会议", variant: "primary" as const },
  task: { label: "任务", variant: "warning" as const },
  reminder: { label: "提醒", variant: "danger" as const },
  personal: { label: "个人", variant: "info" as const },
}

const weekDays = ["一", "二", "三", "四", "五", "六", "日"]
const monthDays = Array.from({ length: 30 }, (_, i) => i + 1)

function CalendarPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">日历</h1>
          <p className="text-surface-500 text-sm mt-1">2026年6月</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1">
            <Button variant="ghost" size="icon"><ChevronLeft size={16} /></Button>
            <span className="text-sm font-medium px-2">2026年 6月</span>
            <Button variant="ghost" size="icon"><ChevronRight size={16} /></Button>
          </div>
          <Button>
            <Plus size={16} />
            新建事件
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-px bg-surface-100 rounded-lg overflow-hidden">
              {weekDays.map((day) => (
                <div key={day} className="text-center py-2 text-xs font-semibold text-surface-500 bg-white">
                  {day}
                </div>
              ))}
              {/* Empty cells before June 1st (Monday) */}
              {monthDays.slice(0, 30).map((day) => {
                const isToday = day === 10
                const eventsOnDay = demoCalendarEvents.filter(
                  (e) => e.date === `2026-06-${String(day).padStart(2, "0")}`
                )
                return (
                  <div
                    key={day}
                    className={`min-h-[80px] p-1.5 bg-white text-xs ${
                      isToday ? "ring-2 ring-primary-500 ring-inset rounded-lg" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-1 ${
                        isToday ? "bg-primary-600 text-white" : "text-surface-600"
                      }`}
                    >
                      {day}
                    </span>
                    {eventsOnDay.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="truncate rounded px-1 py-0.5 mb-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor:
                            event.type === "meeting"
                              ? "#dbeafe"
                              : event.type === "task"
                              ? "#fef3c7"
                              : event.type === "reminder"
                              ? "#fee2e2"
                              : "#e0e7ff",
                          color:
                            event.type === "meeting"
                              ? "#1d4ed8"
                              : event.type === "task"
                              ? "#92400e"
                              : event.type === "reminder"
                              ? "#991b1b"
                              : "#3730a3",
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {eventsOnDay.length > 2 && (
                      <span className="text-[10px] text-surface-400">+{eventsOnDay.length - 2} 更多</span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Events List */}
        <Card>
          <CardHeader>
            <CardTitle>日程列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoCalendarEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-surface-50 transition-colors cursor-pointer border border-surface-100"
              >
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-lg font-bold text-primary-600">
                    {event.date.split("-")[2]}
                  </span>
                  <span className="text-[10px] text-surface-400">
                    {["日", "一", "二", "三", "四", "五", "六"][new Date(event.date).getDay()]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-surface-500 mt-0.5 line-clamp-1">{event.description}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-surface-400">
                      <Clock size={10} /> {event.time} · {event.duration}分钟
                    </span>
                    <Badge variant={eventTypeConfig[event.type].variant}>
                      {eventTypeConfig[event.type].label}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
})
