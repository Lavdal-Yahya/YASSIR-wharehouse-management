import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { ImageUploadField } from '@/components/ImageUploadField';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useSettings, useUpdateSettings, useUploadLogo } from '../api';

const schema = z.object({
  businessName: z.string().trim().max(200),
  currency: z.literal('MRU'),
  receiptFooter: z.string().max(500),
});
type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const uploadLogo = useUploadLogo();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: '', currency: 'MRU', receiptFooter: '' },
  });

  useEffect(() => {
    if (!settings.data) return;
    form.reset({
      businessName: settings.data.businessName,
      currency: (settings.data.currency as 'MRU') || 'MRU',
      receiptFooter: settings.data.receiptFooter,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
    } catch { /* surfaced */ }
  });

  if (settings.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> {t('loading')}</div>;
  }
  if (settings.error) {
    return <p role="alert" className="text-sm text-debt-fg">{errorMessage(settings.error, t)}</p>;
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-line bg-white p-4 shadow-sm lg:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t('settings.form.businessName')}
              {...form.register('businessName')}
            />
            <div className="flex flex-col gap-1 text-start">
              <label className="text-sm font-medium text-ink" htmlFor="s-cur">
                {t('settings.form.currency')}
              </label>
              <select
                id="s-cur"
                className="w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
                {...form.register('currency')}
              >
                <option value="MRU">MRU</option>
              </select>
              <p className="text-xs text-muted">{t('settings.form.currencyHint')}</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-ink text-start" htmlFor="s-footer">
                {t('settings.form.receiptFooter')}
              </label>
              <textarea
                id="s-footer"
                rows={3}
                className="mt-1 w-full rounded-md border border-[#C8C9D4] bg-white px-3 py-2 text-sm text-ink"
                {...form.register('receiptFooter')}
              />
            </div>
          </div>
          {update.error ? (
            <p role="alert" className="mt-3 rounded-md bg-debt-bg px-3 py-2 text-sm text-debt-fg">
              {errorMessage(update.error, t)}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button type="submit" loading={update.isPending}>{t('common.save')}</Button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
            <ImageUploadField
              label={t('settings.form.logo')}
              currentUrl={settings.data?.logoUrl || null}
              uploading={uploadLogo.isPending}
              onFile={async (f) => { await uploadLogo.mutateAsync(f); }}
              error={uploadLogo.error ? errorMessage(uploadLogo.error, t) : undefined}
            />
          </section>

          <section className="rounded-lg border border-line bg-white p-4 shadow-sm text-start">
            <h2 className="mb-2 text-sm font-semibold text-ink">{t('settings.related.title')}</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li>
                <Link to="/expense-categories" className="text-ink hover:underline">
                  {t('settings.related.expenseCategories')}
                </Link>
              </li>
              <li>
                <Link to="/categories" className="text-ink hover:underline">
                  {t('settings.related.categories')}
                </Link>
              </li>
              <li>
                <Link to="/shops" className="text-ink hover:underline">
                  {t('settings.related.shops')}
                </Link>
              </li>
              <li>
                <Link to="/users" className="text-ink hover:underline">
                  {t('settings.related.users')}
                </Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
