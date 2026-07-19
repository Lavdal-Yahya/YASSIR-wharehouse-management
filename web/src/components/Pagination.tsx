import { useTranslation } from 'react-i18next';
import { Button } from './Button';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-slate-600">
      <span>{t('common.paginationLabel', { page, total: totalPages })}</span>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => onChange(page - 1)} disabled={!canPrev}>
          {t('common.previous')}
        </Button>
        <Button variant="secondary" onClick={() => onChange(page + 1)} disabled={!canNext}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
