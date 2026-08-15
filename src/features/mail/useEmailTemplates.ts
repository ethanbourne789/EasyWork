import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mailApi } from "./mailApi";
import type { EmailTemplate, EmailSignature } from "@/types";

// 邮件模板 hooks（后端 mail_list/save/delete_template 已就绪）
export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const data = await mailApi.listTemplates();
      return (data ?? []) as EmailTemplate[];
    },
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; subject?: string; body: string }) => {
      return mailApi.saveTemplate({ name: input.name, subject: input.subject, body: input.body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmailTemplate> }) => {
      // 后端是 upsert，需带全量字段；先取回合并（null 统一转 undefined）
      let merged = {
        name: data.name ?? "",
        subject: data.subject ?? undefined,
        body: data.body ?? undefined,
      };
      if (!data.name) {
        const list = await mailApi.listTemplates();
        const prev = (list ?? []).find((t) => t.id === id);
        merged = {
          name: prev?.name ?? "",
          subject: (data.subject !== undefined ? data.subject : prev?.subject) ?? undefined,
          body: (data.body !== undefined ? data.body : prev?.body) ?? undefined,
        };
      }
      return mailApi.saveTemplate({ id, ...merged });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await mailApi.deleteTemplate(id);
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
