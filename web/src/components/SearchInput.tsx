import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

// Debounced search box (300ms default, per phase-2.md §4).
// Keeps a local draft so typing stays fluid while the parent list re-fetches.
export function SearchInput({ value, onChange, placeholder, debounceMs = 300 }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const h = window.setTimeout(() => onChange(draft), debounceMs);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, debounceMs]);

  return (
    <input
      type="search"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder ?? t('common.search')}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-slate-400"
    />
  );
}
