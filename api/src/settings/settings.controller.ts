import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MAX_IMAGE_BYTES } from '../common/uploads/image-processor';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  // Public read — the login page needs businessName + logoUrl before auth.
  // Safety comes from the whitelist in SETTING_KEYS.
  @Public()
  @Get()
  read() {
    return this.svc.read();
  }

  @Roles(Role.OWNER)
  @Put()
  update(@Body() dto: UpdateSettingsDto) {
    return this.svc.writeMany(dto);
  }

  @Roles(Role.OWNER)
  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  setLogo(
    @UploadedFile()
    file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ) {
    return this.svc.setLogo(file);
  }
}
