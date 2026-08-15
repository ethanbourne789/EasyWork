import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-4xl font-semibold text-foreground">
        404
      </h1>
      <p className="text-muted-foreground">
        {t("notFound.message", "页面不存在或已被移动。")}
      </p>
      <Button asChild>
        <Link to="/dashboard">{t("notFound.backHome", "返回首页")}</Link>
      </Button>
    </div>
  );
}
