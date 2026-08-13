import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { loginDemo, useAuthStore } from "@/features/auth/authStore";
import { friendlyAuthError } from "@/lib/authErrors";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少 6 位"),
});

export function Login() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [demoLoading, setDemoLoading] = useState(false);

  // 已登录的回访用户：getSession 解析完成后自动跳转，避免被卡在登录页
  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  // 以演示账号进入：走真实 Supabase 登录（演示数据已 seed 进数据库）。
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

    setDemoLoading(true); // 复用 demoLoading 状态
    const { error: supaError } = await supabase.auth.signInWithPassword({ email, password });
    setDemoLoading(false);
    if (supaError) {
      // 明确提示登录失败原因，而不是偷偷用演示会话顶替
      setError(friendlyAuthError(supaError));
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold text-center">登录 EasyWork</h1>

        <form onSubmit={handlePasswordLogin} className="space-y-3" noValidate>
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
          <Button type="submit" className="w-full" disabled={demoLoading}>
            {demoLoading ? "登录中..." : "登录"}
          </Button>
        </form>

        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p>
            没有账号？<Link to="/register" className="text-primary underline">注册</Link>
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
