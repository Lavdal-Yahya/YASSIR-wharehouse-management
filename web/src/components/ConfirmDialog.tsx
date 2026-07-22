import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

// Destructive confirmation — always a reason (design brief §4.11 +
// spec §25). Modal is small (max 400px), backdrop dims lightly, ESC
// closes. The confirm button colour switches on `danger`.

type Props = {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-line bg-surface p-5 shadow-[0_16px_40px_rgba(24,25,40,0.14)] text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-semibold leading-snug text-ink">
          {title}
        </h2>
        {body ? (
          <div className="mt-3 text-[14.5px] leading-relaxed text-ink/85">
            {body}
          </div>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 !bg-neutral-bg !text-ink hover:!bg-line"
          >
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'primary' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            className={
              'flex-1 ' +
              (danger
                ? '!bg-debt hover:!bg-debt-fg focus-visible:!outline-debt'
                : '')
            }
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
