import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * 网络状态指示器：监听 navigator.onLine 变化，离线时显示顶部提示条
 */
export function NetworkStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="pointer-events-auto fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5" />
        <span>网络已断开，部分功能不可用</span>
      </div>
    </div>
  );
}
