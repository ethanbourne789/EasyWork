import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Login } from "@/features/auth/Login";
import { Register } from "@/features/auth/Register";
import { useAuthStore } from "@/features/auth/authStore";

const rootRoute = createRootRouteWithContext()({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: Login,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: Register,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: () => {
    const { session, loading } = useAuthStore.getState();
    if (!loading && !session) {
      throw redirect({ to: "/login" });
    }
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: Dashboard,
});

const tasksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/tasks",
  component: () => <div className="p-4">任务模块（待实现）</div>,
});

const mailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mail",
  component: () => <div className="p-4">邮箱模块（待实现）</div>,
});

const notesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notes",
  component: () => <div className="p-4">笔记模块（待实现）</div>,
});

const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/finance",
  component: () => <div className="p-4">记账模块（待实现）</div>,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: () => <div className="p-4">设置（待实现）</div>,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    dashboardRoute,
    tasksRoute,
    mailRoute,
    notesRoute,
    financeRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}