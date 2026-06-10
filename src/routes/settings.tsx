import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Monitor,
  Sun,
  Database,
  Keyboard,
  Bell,
  Globe,
  Info,
  ChevronRight,
} from "lucide-react"

function SettingsPage() {
  return (
    <div className="space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-surface-500 text-sm mt-1">管理应用配置和偏好</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun size={18} className="text-amber-500" />
            外观
          </CardTitle>
          <CardDescription>自定义应用主题和显示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "主题模式", value: "跟随系统", icon: Monitor },
            { label: "字体大小", value: "中 (14px)", icon: Keyboard },
            { label: "语言", value: "简体中文", icon: Globe },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <item.icon size={17} className="text-surface-400" />
                <span className="text-sm">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-500">{item.value}</span>
                <ChevronRight size={14} className="text-surface-300" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database size={18} className="text-primary-500" />
            数据管理
          </CardTitle>
          <CardDescription>数据库、备份与同步</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">数据库位置</p>
              <p className="text-xs text-surface-400">~/easywork/data.db</p>
            </div>
            <Badge variant="success">运行中</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">自动备份</p>
              <p className="text-xs text-surface-400">每日 03:00 自动备份到本地</p>
            </div>
            <Badge variant="info">已启用</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">立即备份</Button>
            <Button variant="outline" size="sm">恢复数据</Button>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
              清空所有数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell size={18} className="text-amber-500" />
            通知
          </CardTitle>
          <CardDescription>管理提醒和系统通知</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "任务到期提醒", enabled: true },
            { label: "日历事件提醒", enabled: true },
            { label: "股票价格预警", enabled: false },
            { label: "运动目标达成", enabled: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <span className="text-sm">{item.label}</span>
              <div
                className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${
                  item.enabled ? "bg-primary-600" : "bg-surface-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    item.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info size={18} className="text-surface-400" />
            关于
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-surface-500">版本</span>
              <span className="font-medium">v0.1.0-alpha</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">技术栈</span>
              <span className="font-medium">Tauri 2.0 + React + Rust</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">构建日期</span>
              <span className="font-medium">2026-06-10</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-surface-500">开发者</span>
              <span className="font-medium">Ethan</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})
