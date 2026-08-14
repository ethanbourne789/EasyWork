import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useAuthStore } from "@/features/auth/authStore";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loggingIn, setLoggingIn] = useState(false);
  const [enteringDemo, setEnteringDemo] = useState(false);

  const loginSchema = z.object({
    email: z.string().email(t("auth.invalidEmail")),
    password: z.string().min(6, t("auth.passwordTooShort")),
  });

  // 已登录的回访用户：本地会话恢复完成后自动跳转
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fe: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") fe.email = issue.message;
        if (issue.path[0] === "password") fe.password = issue.message;
      }
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});

    setLoggingIn(true);
    const err = await useAuthStore.getState().login(email, password);
    setLoggingIn(false);
    if (err) {
      setError(err);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const handleEnterDemo = async () => {
    setError(null);
    setEnteringDemo(true);
    const err = await useAuthStore.getState().enterDemo();
    setEnteringDemo(false);
    if (err) {
      setError(err);
      return;
    }
    toast(t("auth.demoEnterSuccess"), "success");
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">{t("auth.loginTitle")}</h1>

        <form onSubmit={handlePasswordLogin} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Input
              type="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-500">{fieldErrors.email}</p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              type="password"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && (
              <p className="text-xs text-red-500">{fieldErrors.password}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loggingIn || enteringDemo}>
            {loggingIn ? t("auth.loggingIn") : t("auth.login")}
          </Button>
        </form>

        <div className="relative flex items-center justify-center">
          <span className="absolute inset-x-0 h-px bg-border" />
          <span className="relative bg-background px-2 text-xs text-muted-foreground">{t("auth.demoDivider")}</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleEnterDemo}
          disabled={loggingIn || enteringDemo}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {enteringDemo ? t("auth.demoEntering") : t("auth.enterDemo")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("auth.demoHint")}</p>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            {t("auth.noAccount")}<Link to="/register" className="text-primary underline">{t("auth.register")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
