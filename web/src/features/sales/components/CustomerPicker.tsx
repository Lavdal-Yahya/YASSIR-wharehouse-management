import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { SearchInput } from '@/components/SearchInput';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useCustomersList } from '@/features/customers/api';
import type { CustomerChoice } from '../state';

// Inline customer picker for the sale flow's payment step. Two modes:
//   * pick — search + tap an existing customer
//   * create — inline name (+ optional phone), server creates the row
//              inside the sale transaction (rolls back if the sale
//              fails, per api/src/sales/sales.service.ts)
//
// `required` marks the field with a debt-tone outline + hint — the
// design brief's "customer required because debt exists" moment is
// inline, next to the field, not modal.

type Props = {
  value: CustomerChoice | null;
  onPickExisting: (c: { id: string; name: string; phone: string | null }) => void;
  onCreateNew: (c: { name: string; phone: string | null }) => void;
  onClear: () => void;
  required?: boolean;
};

export function CustomerPicker({
  value,
  onPickExisting,
  onCreateNew,
  onClear,
  required = false,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const customers = useCustomersList({
    page: 1,
    pageSize: 20,
    search: search || undefined,
  });

  if (value) {
    // Chosen customer — compact summary row with a Clear action.
    return (
      <div
        className={
          'flex items-center gap-3 rounded-lg border-[1.5px] p-3 ' +
          'border-collected bg-collected-bg/40'
        }
      >
        <div className="grow text-start">
          <div className="text-[15px] font-semibold text-ink">
            {value.kind === 'existing' ? value.name : value.name}
            {value.kind === 'new' ? (
              <span className="ms-2 text-[12px] font-medium text-muted">
                {t('sell.customer.newSuffix')}
              </span>
            ) : null}
          </div>
          <div className="text-[13px] text-muted">
            {value.phone ?? t('sell.customer.noPhone')}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('sell.customer.clear')}
        </Button>
      </div>
    );
  }

  const outline = required
    ? 'border-debt'
    : 'border-line';
  const hint = required
    ? t('sell.customer.requiredHint')
    : null;

  return (
    <div
      className={`rounded-lg border-[1.5px] bg-surface p-3 ${outline}`}
      role={required ? 'alert' : undefined}
    >
      {hint ? (
        <p className="mb-2 text-[13px] font-semibold text-debt-fg">{hint}</p>
      ) : null}
      <div className="mb-3 inline-flex gap-1 rounded-input bg-neutral-bg p-1">
        <button
          type="button"
          onClick={() => setMode('pick')}
          className={
            'rounded-input px-3 py-1.5 text-[13.5px] font-semibold transition-colors ' +
            (mode === 'pick'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-muted hover:text-ink')
          }
        >
          {t('sell.customer.pickExisting')}
        </button>
        <button
          type="button"
          onClick={() => setMode('new')}
          className={
            'rounded-input px-3 py-1.5 text-[13.5px] font-semibold transition-colors ' +
            (mode === 'new'
              ? 'bg-surface text-ink shadow-sm'
              : 'text-muted hover:text-ink')
          }
        >
          {t('sell.customer.pickNew')}
        </button>
      </div>

      {mode === 'pick' ? (
        <div className="flex flex-col gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('sell.customer.searchPlaceholder')}
          />
          {customers.isLoading ? (
            <div className="flex items-center gap-2 p-1 text-[13.5px] text-muted">
              <Spinner /> {t('loading')}
            </div>
          ) : customers.error ? (
            <p role="alert" className="text-[13.5px] text-debt-fg">
              {errorMessage(customers.error, t)}
            </p>
          ) : customers.data && customers.data.items.length === 0 ? (
            <p className="p-1 text-[13.5px] text-muted">
              {t('sell.customer.noMatch')}
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto">
              {customers.data?.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onPickExisting({ id: c.id, name: c.name, phone: c.phone })
                    }
                    className="flex w-full items-center justify-between gap-2 py-2 text-start text-[14px] text-ink hover:bg-tint/50"
                  >
                    <span>
                      <span className="font-semibold">{c.name}</span>
                      {c.phone ? (
                        <span className="ms-2 text-[13px] text-muted">{c.phone}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            label={t('sell.customer.newName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Input
            label={
              <>
                {t('sell.customer.newPhone')}{' '}
                <span className="text-[13px] font-medium text-muted">
                  ({t('common.optional')})
                </span>
              </>
            }
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            inputMode="tel"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={newName.trim().length === 0}
            onClick={() =>
              onCreateNew({
                name: newName.trim(),
                phone: newPhone.trim() === '' ? null : newPhone.trim(),
              })
            }
          >
            {t('sell.customer.attachNew')}
          </Button>
        </div>
      )}
    </div>
  );
}
