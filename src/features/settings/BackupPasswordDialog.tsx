import { useState } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useTranslation } from "react-i18next";

interface BackupPasswordDialogProps {
  open: boolean;
  /** export：可选的导出加密密码（留空 = 未加密）；import：必填的解密密码 */
  mode: "export" | "import";
  onOpenChange: (open: boolean) => void;
  /** 确认回调，返回用户输入的密码（export 模式下可能为空串） */
  onConfirm: (password: string) => void;
  /** 确认按钮加载态 */
  busy?: boolean;
}

/** 备份导出/导入的密码弹窗：导出时可选择加密，导入时对加密备份要求输入密码。 */
export function BackupPasswordDialog({
  open,
  mode,
  onOpenChange,
  onConfirm,
  busy = false,
}: BackupPasswordDialogProps) {
  const { t } = useTranslation();
  const isExport = mode === "export";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const resetForm = () => {
    setPassword("");
    setConfirmPassword("");
    setShow(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (isExport) {
      // 导出密码可选：留空则导出未加密备份；填写则必须两次一致
      if (password !== confirmPassword) {
        toast(t('settings.backup.passwordMismatch'), "error");
        return;
      }
    } else if (!password) {
      toast(t('settings.backup.passwordRequired'), "error");
      return;
    }
    onConfirm(password);
  };

  const eyeToggle = (
    shown: boolean,
    onToggle: (v: boolean) => void,
    label: string
  ) => (
    <button
      type="button"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => onToggle(!shown)}
      aria-label={label}
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      ariaLabel={isExport ? t('settings.backup.exportPassword') : t('settings.backup.importPassword')}
    >
      <DialogContent>
        <DialogClose onClose={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {isExport ? t('settings.backup.exportPassword') : t('settings.backup.importPassword')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-4">
          {isExport ? t('settings.backup.exportPasswordDesc') : t('settings.backup.importPasswordDesc')}
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="backup-password" className="text-sm font-medium">{t('settings.backup.password')}</label>
            <div className="relative">
              <Input
                id="backup-password"
                type={show ? "text" : "password"}
                placeholder={t('settings.backup.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {eyeToggle(show, setShow, t('settings.showPassword'))}
            </div>
          </div>
          {isExport && (
            <div className="space-y-2">
              <label htmlFor="backup-confirm-password" className="text-sm font-medium">{t('settings.backup.confirmPassword')}</label>
              <div className="relative">
                <Input
                  id="backup-confirm-password"
                  type={showConfirm ? "text" : "password"}
                  placeholder={t('settings.backup.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {eyeToggle(showConfirm, setShowConfirm, t('settings.showPassword'))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {isExport ? t('settings.export') : t('settings.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
