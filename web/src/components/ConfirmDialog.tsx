import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {body ? <div className="mt-2 text-sm text-slate-600">{body}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'primary' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            className={danger ? '!bg-red-600 hover:!bg-red-700 focus-visible:!outline-red-600' : ''}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
