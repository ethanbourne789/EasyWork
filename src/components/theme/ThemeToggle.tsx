import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

const NEXT_THEME = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Moon : theme === "dark" ? Sun : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label="切换主题"
      title={`主题：${theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}`}
    >
      <Icon size={18} />
    </Button>
  );
}