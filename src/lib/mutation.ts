import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { toast } from "./toast";

/**
 * 对 TanStack Query 的 useMutation 做默认错误兜底：
 * 未显式指定 onError 的 mutation 失败时会自动弹出 toast，
 * 避免「网络异常 / RLS 拒绝 / 唯一约束冲突」被静默吞掉。
 */
export function useSafeMutation<TData, TError, TVariables, TContext>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
  return useMutation({
    ...options,
    onError:
      options.onError ??
      ((error) => {
        const msg = error instanceof Error ? error.message : "操作失败，请重试";
        toast(msg, "error");
      }),
  });
}
