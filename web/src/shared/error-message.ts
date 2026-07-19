import type { TFunction } from 'i18next';
import { ApiError } from './api-client';

// Maps an API error to a localized string via i18n keys `errors.<CODE>`.
// Unknown codes fall through to the INTERNAL bucket rather than exposing a
// raw server string.
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return t('errors.INTERNAL');
}
