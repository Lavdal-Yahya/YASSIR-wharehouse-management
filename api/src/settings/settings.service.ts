import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { processImage } from '../common/uploads/image-processor';
import { SETTING_KEYS, SettingKey } from './dto/settings.dto';
import { SettingKeyNotWritableError } from './errors';

// Whitelisted-only settings surface. The AppSetting table is otherwise free-
// form, so the whitelist is where safety lives (phase-2.md §3).

export type Settings = Record<SettingKey, string>;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<Settings> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: SETTING_KEYS as unknown as string[] } },
    });
    const byKey = new Map(rows.map((r) => [r.key as SettingKey, r.value]));
    const out: Partial<Settings> = {};
    for (const key of SETTING_KEYS) {
      out[key] = byKey.get(key) ?? '';
    }
    return out as Settings;
  }

  async writeMany(patch: Partial<Settings>): Promise<Settings> {
    // Reject non-whitelisted keys explicitly. DTO already trims them at the
    // controller layer, but defense in depth catches direct service callers.
    for (const key of Object.keys(patch)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) {
        // Non-whitelisted — surface as a clear failure, not a silent drop.
        throw new SettingKeyNotWritableError(key);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        await tx.appSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });
      }
    });
    return this.read();
  }

  async setLogo(
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ): Promise<Settings> {
    const logoUrl = await processImage(file, 'settings');
    await this.prisma.appSetting.upsert({
      where: { key: 'logoUrl' },
      update: { value: logoUrl },
      create: { key: 'logoUrl', value: logoUrl },
    });
    return this.read();
  }
}
