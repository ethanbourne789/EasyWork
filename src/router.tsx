import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Login } from "@/features/auth/Login";
import { Register } from "@/features/auth/Register";
import { Tasks } from "@/features/tasks/Tasks";
import { Mail } from "@/features/mail/Mail";
import { Notes } from "@/features/notes/Notes";
import { Finance } from "@/features/finance/Finance";
import { Settings } from "@/features/settings/Settings";
import { Calendar } from "@/features/calendar/Calendar";
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

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    const { user, loading } = useAuthStore.getState();
    // loading 期间（本地会话恢复中）不打断渲染，避免已登录回访用户被弹回登录页
    if (loading) return;
    throw redirect({ to: user ? "/dashboard" : "/login" });
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  beforeLoad: () => {
    const { user, loading } = useAuthStore.getState();
    if (!loading && !user) {
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
  component: Tasks,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
});

const mailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/mail",
  component: Mail,
});

const notesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notes",
  component: Notes,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
});

const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/finance",
  component: Finance,
  validateSearch: (search: Record<string, unknown>) => ({
    focus: typeof search.focus === "string" ? search.focus : undefined,
  }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: Settings,
});

const calendarRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/calendar",
  component: Calendar,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    dashboardRoute,
    tasksRoute,
    mailRoute,
    notesRoute,
    financeRoute,
    calendarRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}