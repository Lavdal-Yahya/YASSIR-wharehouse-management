import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

// Debounced search field (300ms default, phase-2.md §4). Icon-in-input
// with a magnifier so users on a phone recognise it without a label.
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
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" />
        </svg>
      </span>
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? t('common.search')}
        className="w-full h-[50px] rounded-[10px] border-[1.5px] border-[#C8C9D4] bg-surface pe-[14px] ps-10 text-[15px] text-ink placeholder:text-muted focus:outline focus:outline-2 focus:outline-brand"
      />
    </div>
  );
}
