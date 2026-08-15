import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUserId } from "@/features/auth/authStore";
import { authApi } from "@/lib/authApi";
import { toast } from "@/lib/toast";
import { useTranslation } from "react-i18next";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changing, setChanging] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast(t('settings.enterCurrentPassword'), "error");
      return;
    }
    if (!newPassword) {
      toast(t('settings.enterNewPassword'), "error");
      return;
    }
    if (newPassword.length < 6) {
      toast(t('settings.passwordTooShort'), "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast(t('settings.passwordsMismatch'), "error");
      return;
    }
    if (newPassword === currentPassword) {
      toast(t('settings.passwordSameAsCurrent'), "error");
      return;
    }

    setChanging(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) throw new Error(t('settings.notLoggedIn'));
      await authApi.changePassword(userId, currentPassword, newPassword);

      resetForm();
      onOpenChange(false);
      toast(t('settings.changePasswordSuccess'), "success");
    } catch (err) {
      toast(t('settings.changePasswordFailed') + String(err ?? t('settings.unknownError')), "error");
    } finally {
      setChanging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} ariaLabel={t('settings.changePassword')}>
      <DialogContent>
        <DialogClose onClose={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t('settings.changePassword')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-4">{t('settings.passwordMinLength')}</p>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.currentPassword')}</label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                placeholder={t('settings.enterCurrentPassword')}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? t('settings.hidePassword') : t('settings.showPassword')}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.newPassword')}</label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                placeholder={t('settings.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? t('settings.hidePassword') : t('settings.showPassword')}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.confirmNewPassword')}</label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder={t('settings.confirmNewPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? t('settings.hidePassword') : t('settings.showPassword')}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleChangePassword} disabled={changing}>
            {changing ? t('settings.changingPassword') : t('settings.changePassword')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
