import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Whitelisted keys — anything else is rejected, not ignored.
// See phase-2.md §3 (settings) — non-whitelisted keys returning 400 is what
// makes GET-while-unauthenticated safe.
export const SETTING_KEYS = [
  'businessName',
  'currency',
  'receiptFooter',
  'logoUrl',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(200) businessName?: string;
  @IsOptional() @IsIn(['MRU']) currency?: string;
  @IsOptional() @IsString() @MaxLength(500) receiptFooter?: string;
  // logoUrl is set only via POST /settings/logo — reject explicit updates here.
}
