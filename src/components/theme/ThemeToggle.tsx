import { Moon, Sun, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/ThemeProvider";

const NEXT_THEME = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const Icon = theme === "light" ? Moon : theme === "dark" ? Sun : Monitor;
  const themeLabel = theme === "system" ? t("layout.followSystem") : theme === "light" ? t("layout.light") : t("layout.dark");
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={t("layout.switchTheme")}
      title={`${t("layout.theme")}：${themeLabel}`}
    >
      <Icon size={18} />
    </Button>
  );
}