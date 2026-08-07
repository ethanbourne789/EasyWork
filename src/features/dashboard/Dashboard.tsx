import { OverviewCards } from "@/features/dashboard/OverviewCards";
import { TaskTrendChart } from "@/features/dashboard/TaskTrendChart";
import { GlobalSearch } from "@/features/dashboard/GlobalSearch";

export function Dashboard() {
  return (
    <div className="space-y-4 p-4">
      <GlobalSearch />
      <OverviewCards />
      <TaskTrendChart />
    </div>
  );
}