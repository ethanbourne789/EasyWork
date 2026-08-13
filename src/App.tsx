import type { ReactNode } from "react";
import { Component, type ErrorInfo, useEffect, useRef } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryCache, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useRealtimeSync } from "@/features/realtime/useRealtimeSync";
import { useAuthStore } from "@/features/auth/authStore";
import { toast } from "@/lib/toast";
import { router } from "@/router";
import { DEFAULT_RETRY_COUNT, MUTATION_RETRY_COUNT, QUERY_STALE_TIME } from "@/lib/constants";

// 忽略「请求被中止/取消」类错误，避免重复提示或无意义的噪音
const IGNORED_QUERY_ERROR = /abort|cancel/i;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (IGNORED_QUERY_ERROR.test(message)) return;
      toast(message || "数据加载失败，请稍后重试", "error");
    },
  }),
  defaultOptions: {
    queries: {
      retry: DEFAULT_RETRY_COUNT,
      staleTime: QUERY_STALE_TIME,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: MUTATION_RETRY_COUNT,
    },
  },
});

function AuthGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">启动中...</p>
        </div>
      </div>
    );
  }
  return children;
}

function AuthedRouter() {
  const session = useAuthStore((s) => s.session);
  useRealtimeSync(!!session);
  return (
    <QueryCacheGuard>
      <RouterProvider router={router} />
    </QueryCacheGuard>
  );
}

/**
 * 登出/切换账号时清空 Query 缓存，防止把上一个用户的私有数据
 * 从缓存直接渲染给下一个登录用户（多数查询 key 不含 user_id）。
 */
function QueryCacheGuard({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const prevSession = useRef(session);

  useEffect(() => {
    if (prevSession.current && !session) {
      queryClient.clear();
    }
    prevSession.current = session;
  }, [session, queryClient]);

  return children;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; info: ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-destructive">应用启动失败</h1>
            <p className="text-sm text-muted-foreground">渲染时发生错误，请刷新重试或联系开发者。</p>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
              {this.state.error.message}
              {this.state.info?.componentStack}
            </pre>
            <Button onClick={() => window.location.reload()}>重试</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGate>
            <AuthedRouter />
          </AuthGate>
        </QueryClientProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}