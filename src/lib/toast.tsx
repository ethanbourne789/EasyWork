/**
 * 极简命令式 toast：无需 Provider，直接挂载到 body。
 * 用于让异步 mutation 的失败对用户可见（修复「错误被静默吞掉」）。
 */

type ToastType = "error" | "success" | "info";

let container: HTMLDivElement | null = null;

function ensureContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.className =
    "fixed top-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none";
  document.body.appendChild(container);
  return container;
}

const TYPE_CLASS: Record<ToastType, string> = {
  error: "bg-destructive text-white",
  success: "bg-success text-white",
  info: "bg-foreground text-background",
};

export function toast(message: string, type: ToastType = "info") {
  if (typeof document === "undefined") return;
  const c = ensureContainer();
  const el = document.createElement("div");
  el.className = `pointer-events-auto px-4 py-2 rounded-lg shadow-lg text-sm font-medium max-w-[340px] ${TYPE_CLASS[type]}`;
  el.textContent = message;
  c.appendChild(el);
  // 入场过渡
  el.style.opacity = "0";
  el.style.transform = "translateY(-6px)";
  requestAnimationFrame(() => {
    el.style.transition = "opacity .18s ease, transform .18s ease";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 200);
  }, 3500);
}
