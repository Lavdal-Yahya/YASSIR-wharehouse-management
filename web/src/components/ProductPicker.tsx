import { useTranslation } from 'react-i18next';
import { useProductsList } from '@/features/products/api';

// Minimalistic product picker: <select> populated by the products list.
// Callers pass `value` (product id) + `onChange`. For v1 this is enough —
// the products list is small; a searchable combobox is a v2 upgrade.
// Archived products are excluded on the backend.

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
  // pageSize=200 covers the client's realistic catalogue size (spec §2 lists
  // phones/AirPods/earphones/accessories/clothing/general — small catalog).
  const products = useProductsList({ page: 1, pageSize: 200 });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      aria-label={ariaLabel}
    >
      <option value="">{placeholder ?? t('common.choose')}</option>
      {products.data?.items.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.sku ? ` · ${p.sku}` : ''}
        </option>
      ))}
    </select>
  );
}
