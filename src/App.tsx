import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { useAuth } from "@/features/auth/useAuth";
import { router } from "@/router";

const queryClient = new QueryClient();

function AuthedRouter() {
  useAuth();
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthedRouter />
      </QueryClientProvider>
    </ThemeProvider>
  );
}