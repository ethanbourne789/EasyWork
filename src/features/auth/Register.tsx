import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { loginDemo } from "@/features/auth/authStore";
import { friendlyAuthError } from "@/lib/authErrors";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const registerSchema = z
  .object({
    email: z.string().email("请输入有效的邮箱地址"),
    password: z.string().min(6, "密码至少 6 位"),
    confirmPassword: z.string().min(1, "请确认密码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [demoLoading, setDemoLoading] = useState(false);

  const enterDemo = async () => {
    setDemoLoading(true);
    setError(null);
    const { error: demoError } = await loginDemo();
    setDemoLoading(false);
    if (demoError) {
      setError(demoError);
      return;
    }
    navigate({ to: "/dashboard" });
  };

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

    const { data, error: supaError } = await supabase.auth.signUp({ email, password });
    if (supaError) {
      // 注册失败明确提示，不再静默回退到演示会话
      setError(friendlyAuthError(supaError));
      return;
    }
    // 注册成功：若 Supabase 直接返回会话（关闭邮箱确认）则进入应用，否则引导登录
    if (data.session) {
      navigate({ to: "/dashboard" });
    } else {
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">注册 EasyWork</h1>

        <form onSubmit={handleRegister} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Input
              type="email"
              placeholder="邮箱"
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
              placeholder="密码（至少 6 位）"
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
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!fieldErrors.confirmPassword}
            />
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>
            )}
          </div>
          <Button type="submit" className="w-full">
            注册
          </Button>
        </form>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            已有账号？<Link to="/login" className="text-primary underline">登录</Link>
          </p>
          <button
            type="button"
            onClick={enterDemo}
            disabled={demoLoading}
            className="text-primary underline disabled:opacity-50"
          >
            {demoLoading ? "登录中..." : "以演示账号进入"}
          </button>
        </div>
      </div>
    </div>
  );
}
