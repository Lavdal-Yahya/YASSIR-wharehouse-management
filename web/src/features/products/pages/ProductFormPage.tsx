import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { MoneyInput } from '@/components/MoneyInput';
import { ImageUploadField } from '@/components/ImageUploadField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Spinner } from '@/components/Spinner';
import { errorMessage } from '@/shared/error-message';
import { useCategoriesList } from '@/features/categories/api';
import {
  useArchiveProduct,
  useCreateProduct,
  useDeleteProduct,
  useProduct,
  useRestoreProduct,
  useUpdateProduct,
  useUploadProductImage,
} from '../api';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().min(1),
  sku: z.string().trim().max(80).optional().nullable(),
  barcode: z.string().trim().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  defaultPurchaseCost: z.number().int().min(0).nullable(),
  defaultSalePrice: z.number().int().min(0).nullable(),
  lowStockThreshold: z.number().int().min(0).nullable(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: '',
  categoryId: '',
  sku: null,
  barcode: null,
  description: null,
  defaultPurchaseCost: null,
  defaultSalePrice: null,
  lowStockThreshold: null,
};

export default function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const productId = isNew ? undefined : id;

  const { t } = useTranslation();
  const nav = useNavigate();
  const product = useProduct(productId);
  const cats = useCategoriesList({ page: 1, pageSize: 100 });
  const create = useCreateProduct();
  const update = useUpdateProduct(productId ?? '');
  const archive = useArchiveProduct();
  const restore = useRestoreProduct();
  const remove = useDeleteProduct();
  const uploadImage = useUploadProductImage(productId ?? '');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);

  useEffect(() => {
    if (!product.data) return;
    form.reset({
      name: product.data.name,
      categoryId: product.data.categoryId,
      sku: product.data.sku,
      barcode: product.data.barcode,
      description: product.data.description,
      defaultPurchaseCost: product.data.defaultPurchaseCost,
      defaultSalePrice: product.data.defaultSalePrice,
      lowStockThreshold: product.data.lowStockThreshold,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.data]);

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      categoryId: values.categoryId,
      sku: values.sku ?? null,
      barcode: values.barcode ?? null,
      description: values.description ?? null,
      defaultPurchaseCost: values.defaultPurchaseCost ?? null,
      defaultSalePrice: values.defaultSalePrice ?? null,
      lowStockThreshold: values.lowStockThreshold ?? null,
    };
    try {
      if (isNew) {
        const created = await create.mutateAsync(body);
        nav(`/products/${created.id}`, { replace: true });
      } else {
        await update.mutateAsync(body);
      }
    } catch {
      /* surfaced */
    }
  });

  const mutating = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;
  const optional = t('common.optional');

  if (!isNew && product.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> {t('loading')}
      </div>
    );
  }
  if (!isNew && product.error) {
    return (
      <p role="alert" className="text-sm text-debt-fg">
        {errorMessage(product.error, t)}
      </p>
    );
  }

  const isArchived = product.data ? !product.data.active : false;

  return (
    <div>
      <PageHeader
        title={isNew ? t('products.form.newTitle') : product.data?.name ?? t('products.form.editTitle')}
        subtitle={isNew ? undefined : product.data?.categoryName}
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4 shadow-sm lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={t('products.form.name')}
              autoFocus
              {...form.register('name')}
              error={form.formState.errors.name ? t('errors.BAD_REQUEST') : undefined}
            />
            <div className="flex flex-col gap-1 text-start">
              <label className="text-sm font-medium text-ink" htmlFor="p-cat">
                {t('products.form.category')}
              </label>
              <select
                id="p-cat"
                className="w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink focus:outline focus:outline-2 focus:outline-brand"
                {...form.register('categoryId')}
              >
                <option value="">{t('products.form.chooseCategory')}</option>
                {cats.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.categoryId ? (
                <p className="text-sm text-debt-fg">{t('errors.BAD_REQUEST')}</p>
              ) : null}
            </div>

            <Input
              label={<>{t('products.form.sku')} <span className="text-xs text-muted">({optional})</span></>}
              {...form.register('sku', { setValueAs: (v) => (v === '' ? null : v) })}
            />
            <Input
              label={<>{t('products.form.barcode')} <span className="text-xs text-muted">({optional})</span></>}
              {...form.register('barcode', { setValueAs: (v) => (v === '' ? null : v) })}
            />

            <div>
              <MoneyInput
                label={<>{t('products.form.defaultPurchaseCost')} <span className="text-xs text-muted">({optional})</span></>}
                value={form.watch('defaultPurchaseCost')}
                onChange={(v) => form.setValue('defaultPurchaseCost', v, { shouldDirty: true })}
              />
              <p className="mt-1 text-xs text-muted text-start">
                {t('products.form.defaultPurchaseCostHint')}
              </p>
            </div>
            <MoneyInput
              label={<>{t('products.form.defaultSalePrice')} <span className="text-xs text-muted">({optional})</span></>}
              value={form.watch('defaultSalePrice')}
              onChange={(v) => form.setValue('defaultSalePrice', v, { shouldDirty: true })}
            />

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-ink text-start" htmlFor="p-desc">
                {t('products.form.description')} <span className="text-xs text-muted">({optional})</span>
              </label>
              <textarea
                id="p-desc"
                rows={3}
                className="mt-1 w-full rounded-md border border-[#C8C9D4] bg-surface px-3 py-2 text-sm text-ink focus:outline focus:outline-2 focus:outline-brand"
                {...form.register('description', { setValueAs: (v) => (v === '' ? null : v) })}
              />
            </div>

            <MoneyInput
              label={<>{t('products.form.lowStockThreshold')} <span className="text-xs text-muted">({optional})</span></>}
              value={form.watch('lowStockThreshold')}
              onChange={(v) => form.setValue('lowStockThreshold', v, { shouldDirty: true })}
              suffix=""
            />
          </div>

          {mutationError ? (
            <p role="alert" className="mt-4 rounded-md bg-debt-bg px-3 py-2 text-sm text-debt-fg">
              {errorMessage(mutationError, t)}
            </p>
          ) : null}

          <div className="sticky bottom-0 mt-4 flex flex-wrap justify-end gap-2 border-t border-line-soft bg-surface pt-3">
            <Button type="button" variant="secondary" onClick={() => nav('/products')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutating}>
              {isNew ? t('common.create') : t('common.save')}
            </Button>
          </div>
        </div>

        <aside className="space-y-4">
          {isNew ? null : (
            <section className="rounded-lg border border-line bg-surface p-4 shadow-sm">
              <ImageUploadField
                label={t('products.form.image')}
                currentUrl={product.data?.imageUrl ?? null}
                uploading={uploadImage.isPending}
                onFile={async (f) => {
                  await uploadImage.mutateAsync(f);
                }}
                error={uploadImage.error ? errorMessage(uploadImage.error, t) : undefined}
              />
            </section>
          )}
          {isNew ? null : (
            <section className="rounded-lg border border-line bg-surface p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-ink text-start">
                {t('products.dangerZone.title')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {isArchived ? (
                  <Button
                    variant="secondary"
                    onClick={() => productId && restore.mutate(productId)}
                    loading={restore.isPending}
                  >
                    {t('common.restore')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirm('archive')}>
                    {t('common.archive')}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setConfirm('delete')}>
                  {t('common.delete')}
                </Button>
              </div>
              {remove.error ? (
                <p role="alert" className="mt-2 text-sm text-debt-fg">
                  {errorMessage(remove.error, t)}
                </p>
              ) : null}
            </section>
          )}
        </aside>
      </form>

      <ConfirmDialog
        open={confirm === 'archive'}
        title={t('products.archiveConfirm.title')}
        body={t('products.archiveConfirm.body', { name: product.data?.name })}
        loading={archive.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!productId) return;
          await archive.mutateAsync(productId);
          setConfirm(null);
        }}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        danger
        title={t('products.deleteConfirm.title')}
        body={t('products.deleteConfirm.body', { name: product.data?.name })}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!productId) return;
          try {
            await remove.mutateAsync(productId);
            setConfirm(null);
            nav('/products');
          } catch {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
