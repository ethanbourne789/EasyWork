import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mailApi } from "./mailApi";
import type { EmailTemplate, EmailSignature } from "@/types";

// 邮件模板 hooks
// TODO: 后端尚未提供 mail_list/save/delete_templates 命令（P1+ 阶段补齐）；
// 当前 useEmailTemplates* 系列保留 hook 形态但返回空数据 / 抛错占位，
// 避免破坏调用方。后续 Task 切换为真实 Tauri invoke 调用。
export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      return [] as EmailTemplate[];
    },
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_input: { name: string; subject?: string; body: string }) => {
      throw new Error("邮件模板保存暂未实现：等待后端 mail_save_template 命令");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_args: { id: string; data: Partial<EmailTemplate> }) => {
      throw new Error("邮件模板更新暂未实现：等待后端 mail_save_template 命令");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_id: string) => {
      throw new Error("邮件模板删除暂未实现：等待后端 mail_delete_template 命令");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

// 邮件签名 hooks
// 后端 mailApi 提供：listSignatures / saveSignature / deleteSignature / setAccountSignature
// 注意：Rust 端 EmailSignature.html 字段对应原 Supabase schema 的 content 字段。
export function useEmailSignatures() {
  return useQuery({
    queryKey: ["email-signatures"],
    queryFn: async () => {
      const data = await mailApi.listSignatures();
      return (data ?? []) as EmailSignature[];
    },
  });
}

export function useCreateEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; html: string; is_default?: boolean }) => {
      const sig = await mailApi.saveSignature({
        name: input.name,
        html: input.html,
        isDefault: input.is_default,
      });
      return sig as EmailSignature;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-signatures"] });
    },
  });
}

export function useUpdateEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmailSignature> }) => {
      // 后端 mail_save_signature 是 upsert：需要 name + html 必填；
      // 若仅更新部分字段，需要先取回原签名合并。
      let merged: { name: string; html: string; isDefault?: boolean };
      if (!data.name || data.html === undefined) {
        const list = await mailApi.listSignatures();
        const prev = (list ?? []).find((s) => s.id === id);
        merged = {
          name: data.name ?? prev?.name ?? "",
          html: data.html ?? prev?.html ?? "",
          isDefault: data.is_default ?? prev?.is_default,
        };
      } else {
        merged = {
          name: data.name,
          html: data.html,
          isDefault: data.is_default,
        };
      }
      const sig = await mailApi.saveSignature({
        id,
        name: merged.name,
        html: merged.html,
        isDefault: merged.isDefault,
      });
      return sig as EmailSignature;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-signatures"] });
    },
  });
}

export function useDeleteEmailSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await mailApi.deleteSignature(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-signatures"] });
    },
  });
}

export function useDefaultSignature() {
  const { data: signatures } = useEmailSignatures();
  return signatures?.find((s) => s.is_default) ?? null;
}
