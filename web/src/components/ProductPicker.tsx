import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProduct, useProductsList } from '@/features/products/api';

// Searchable product combobox: trigger button + dropdown with a search
// field. Server-side search via /products?search=…&pageSize=50 keeps the
// wire small and stays inside the shared MAX_PAGE_SIZE cap (100). The
// selected product is fetched separately so the trigger keeps showing
// the right name even when the current search page doesn't contain it.

export function ProductPicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(search.trim()), 200);
    return () => window.clearTimeout(h);
  }, [search]);

  const products = useProductsList({
    page: 1,
    pageSize: 50,
    search: debounced || undefined,
  });
  const selected = useProduct(value || undefined);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = value ? (selected.data?.name ?? '…') : '';
  const items = products.data?.items ?? [];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-surface px-3 py-2 text-start text-sm text-ink"
      >
        <span className={label ? '' : 'text-muted'}>
          {label || placeholder || t('common.choose')}
        </span>
        <span aria-hidden className="ms-2 text-muted">▾</span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              aria-label={t('common.search')}
              className="w-full rounded-md border border-[#C8C9D4] bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {products.isLoading ? (
              <li className="p-2 text-sm text-muted">{t('loading')}</li>
            ) : items.length === 0 ? (
              <li className="p-2 text-sm text-muted">{t('common.emptyList')}</li>
            ) : (
              items.map((p) => {
                const isSel = p.id === value;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => {
                        onChange(p.id);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`block w-full px-3 py-2 text-start text-sm hover:bg-tint ${isSel ? 'bg-tint font-medium' : ''}`}
                    >
                      {p.name}
                      {p.sku ? ` · ${p.sku}` : ''}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
