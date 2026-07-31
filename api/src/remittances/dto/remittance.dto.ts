import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RemittanceStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Creating a cash remittance. SHOP users have shopId substituted by
// ShopScopeGuard; OWNER may pass any shopId. Amount must be > 0. The
// service refuses if amount > current cash-on-hand for that shop.
export class CreateRemittanceDto {
  @IsString()
  @MinLength(1)
  shopId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsDateString()
  remittanceDate?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CancelRemittanceDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ListRemittancesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  shopId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string')
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    if (Array.isArray(value)) return value;
    return value;
  })
  @IsEnum(RemittanceStatus, { each: true })
  status?: RemittanceStatus[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
