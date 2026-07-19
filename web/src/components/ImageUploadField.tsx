import { useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from './Spinner';

// Client-side cap mirrors server (2MB). Server still validates magic bytes;
// this only saves an obvious round-trip.
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

type Props = {
  label: ReactNode;
  currentUrl: string | null;
  uploading: boolean;
  onFile: (file: File) => Promise<void>;
  error?: string;
};

export function ImageUploadField({ label, currentUrl, uploading, onFile, error }: Props) {
  const { t } = useTranslation();
  const [clientError, setClientError] = useState<string | null>(null);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setClientError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setClientError(t('errors.PRODUCT_IMAGE_TOO_LARGE'));
      return;
    }
    if (!ALLOWED_MIMES.includes(f.type)) {
      setClientError(t('errors.PRODUCT_IMAGE_INVALID'));
      return;
    }
    try {
      await onFile(f);
    } catch {
      /* parent surfaces error */
    }
    // Reset input so re-selecting the same file re-triggers upload.
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-2 text-start">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {currentUrl ? (
            <img
              src={currentUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
        <label
          className={
            'inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 ' +
            (uploading ? 'pointer-events-none opacity-60' : '')
          }
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onChange}
            disabled={uploading}
          />
          {uploading ? <Spinner /> : null}
          {t('common.chooseImage')}
        </label>
      </div>
      {(clientError ?? error) ? (
        <p role="alert" className="text-sm text-red-600">
          {clientError ?? error}
        </p>
      ) : null}
    </div>
  );
}
