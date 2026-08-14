import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/features/auth/authStore";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [registering, setRegistering] = useState(false);

  const registerSchema = z
    .object({
      email: z.string().email(t("auth.invalidEmail")),
      password: z.string().min(6, t("auth.passwordTooShort")),
      confirmPassword: z.string().min(1, t("auth.pleaseConfirmPassword")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.passwordMismatch"),
      path: ["confirmPassword"],
    });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      const fe: { email?: string; password?: string; confirmPassword?: string } = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email") fe.email = issue.message;
        if (issue.path[0] === "password") fe.password = issue.message;
        if (issue.path[0] === "confirmPassword") fe.confirmPassword = issue.message;
      }
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});

    setRegistering(true);
    // 本地账号注册成功即自动登录（local-first，无邮箱确认流程）
    const err = await useAuthStore.getState().register(email, password, displayName || undefined);
    setRegistering(false);
    if (err) {
      setError(err);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">{t("auth.registerTitle")}</h1>

        <form onSubmit={handleRegister} className="space-y-3" noValidate>
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
          <div className="space-y-1">
            <Input
              type="password"
              placeholder={t("auth.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!fieldErrors.confirmPassword}
            />
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              type="text"
              placeholder={t("auth.displayNamePlaceholder")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={registering}>
            {registering ? t("auth.registering") : t("auth.register")}
          </Button>
        </form>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            {t("auth.haveAccount")}<Link to="/login" className="text-primary underline">{t("auth.login")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
