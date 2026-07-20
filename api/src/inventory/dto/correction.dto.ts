import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';
import { MovementType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Positive = found during recount / added; negative = removed / damaged.
// Zero is meaningless (a no-op audit entry) — DTO rejects it here so the
// service doesn't have to.
export class CreateStockCorrectionDto {
  @IsString()
  @MinLength(1)
  locationId!: string;

  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  adjustmentQuantity!: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListStockCorrectionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// GET /inventory/movements filters — used by the movement history page (P3-11).
export class ListMovementsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(MovementType)
  movementType?: MovementType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// GET /inventory/:locationId filters (balances list).
export class ListBalancesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  outOfStockOnly?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  includeZero?: boolean;
}
