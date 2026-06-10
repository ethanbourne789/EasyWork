import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { demoStocks } from "@/data/demo-data"
import { TrendingUp, TrendingDown } from "lucide-react"

function StocksPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-white">股票</h1>
        <p className="text-surface-500 text-sm mt-1">自选股行情追踪 — 演示数据（数据延迟15分钟）</p>
      </div>

      {/* Market Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "上证指数", value: "3,258.34", change: "+0.86%" },
          { label: "深证成指", value: "11,592.07", change: "+1.23%" },
          { label: "创业板指", value: "2,351.28", change: "-0.34%" },
          { label: "科创50", value: "976.52", change: "+2.15%" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-surface-500">{item.label}</p>
              <p className="text-lg font-bold mt-1">{item.value}</p>
              <span
                className={`text-xs font-medium ${
                  item.change.startsWith("+") ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {item.change}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stock Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-100">
                  {["代码", "名称", "现价", "涨跌额", "涨跌幅", "成交量", "市值", "行业"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-surface-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {demoStocks.map((stock) => (
                  <tr key={stock.symbol} className="hover:bg-surface-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-sm font-mono text-surface-500">{stock.symbol}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{stock.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold">¥{stock.price.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${stock.change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {stock.changePercent >= 0 ? (
                          <TrendingUp size={14} className="text-emerald-600" />
                        ) : (
                          <TrendingDown size={14} className="text-red-500" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            stock.changePercent >= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {stock.changePercent >= 0 ? "+" : ""}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">
                      {(stock.volume / 10000).toFixed(0)}万
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">{stock.marketCap}</td>
                    <td className="px-4 py-3">
                      <Badge variant="info" className="text-[10px]">{stock.sector}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/stocks")({
  component: StocksPage,
})
