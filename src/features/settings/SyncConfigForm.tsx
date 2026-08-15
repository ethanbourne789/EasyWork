import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useSyncConfig, useSyncStatus, useSaveSyncConfig, useDeleteSyncConfig, useTestConnection, useTriggerSync, useSetDeviceName } from "../sync/useSync";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { isTauri } from "@/lib/tauri";
import type { SyncConfig } from "../sync/syncApi";

const PROVIDERS = [
  { value: "supabase", labelKey: "sync.providerSupabase" },
  { value: "aiven", labelKey: "sync.providerAiven" },
  { value: "render", labelKey: "sync.providerRender" },
  { value: "custom", labelKey: "sync.providerCustom" },
];

interface FormValues {
  enabled: boolean;
  provider: string;
  connection_string: string;
  database_name: string;
  device_name: string;
}

export function SyncConfigForm() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useSyncConfig();
  const { data: status } = useSyncStatus();
  const save = useSaveSyncConfig();
  const setDeviceName = useSetDeviceName();
  const del = useDeleteSyncConfig();
  const test = useTestConnection();
  const trigger = useTriggerSync();

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>({
    defaultValues: { enabled: false, provider: "custom", connection_string: "", database_name: "", device_name: "" },
  });

  useEffect(() => {
    if (config) {
      reset({
        enabled: config.enabled,
        provider: config.provider,
        connection_string: config.connection_string,
        database_name: config.database_name,
        device_name: status?.device_name || "",
      });
    }
  }, [config, reset, status?.device_name]);

  const enabled = watch("enabled");

  const onSubmit = async (values: FormValues) => {
    if (values.enabled && !values.connection_string.trim()) {
      toast(`${t("sync.connectionString")} ${t("common.required")}`, "error");
      return;
    }
    const payload: SyncConfig = {
      id: "default",
      enabled: values.enabled,
      provider: values.provider,
      connection_string: values.connection_string.trim(),
      database_name: values.database_name.trim(),
      last_sync_at: config?.last_sync_at ?? null,
      sync_error: null,
      created_at: config?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await save.mutateAsync(payload);
      toast(t("sync.configSaved"), "success");
      // 设备名称单独持久化（SyncConfig 不含该字段）
      if (values.device_name.trim()) setDeviceName.mutate(values.device_name.trim());
      // 保存后自动触发首次同步（新设备连接场景）
      if (values.enabled) trigger.mutate();
    } catch (e) {
      toast(`${t("sync.saveFailed")} ${String(e ?? "")}`, "error");
    }
  };

  const handleTest = async () => {
    const cs = watch("connection_string");
    if (!cs.trim()) {
      toast(`${t("sync.connectionString")} ${t("common.required")}`, "error");
      return;
    }
    try {
      const r = await test.mutateAsync(cs);
      if (r.success) toast(t("sync.connected"), "success");
      else toast(`${t("sync.connectionFailed")}：${r.message}`, "error");
    } catch (e) {
      toast(`${t("sync.connectionFailed")} ${e instanceof Error ? e.message : ""}`, "error");
    }
  };

  const handleDelete = async () => {
    if (
      await confirm({
        title: t("sync.confirmDeleteTitle"),
        description: t("sync.confirmDeleteDesc"),
        confirmText: t("sync.delete"),
        destructive: true,
      })
    ) {
      try {
        await del.mutateAsync();
        toast(t("sync.configDeleted"), "success");
        reset({ enabled: false, provider: "custom", connection_string: "", database_name: "", device_name: "" });
      } catch (e) {
        toast(`${t("sync.saveFailed")} ${String(e ?? "")}`, "error");
      }
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <div className="text-sm font-medium">{t("sync.enabled")}</div>
          <div className="text-xs text-muted-foreground">{t("sync.notConfigured")}</div>
        </div>
        <Checkbox checked={enabled} onCheckedChange={(c) => setValue("enabled", c)} />
      </div>

      <div className="space-y-2">
        <Label>{t("sync.provider")}</Label>
        <Select {...register("provider")}>
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {t(p.labelKey)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t("sync.connectionString")}</Label>
        <Input placeholder={t("sync.connectionStringPlaceholder")} {...register("connection_string")} />
      </div>

      <div className="space-y-2">
        <Label>{t("sync.databaseName")}</Label>
        <Input placeholder="postgres" {...register("database_name")} />
      </div>

      <div className="space-y-2">
        <Label>{t("sync.deviceName")}</Label>
        <Input placeholder="My Laptop" {...register("device_name")} />
      </div>

      <p className="text-xs text-muted-foreground rounded-lg border p-3">{t("sync.securityNotice")}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleTest} disabled={test.isPending || !isTauri()}>
          {test.isPending ? t("sync.testing") : t("sync.testConnection")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t("common.saving") : t("sync.save")}
        </Button>
        <Button type="button" variant="destructive" onClick={handleDelete} disabled={del.isPending}>
          {t("sync.delete")}
        </Button>
      </div>
    </form>
  );
}
