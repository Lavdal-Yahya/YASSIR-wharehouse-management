import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Only name + categoryId are required (spec §10.1). All money/quantities are
// Int MRU (D-004). Optional strings coerce empty → null so the client can send
// blanks without validating client-side.
export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  barcode?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultPurchaseCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultSalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  sku?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  barcode?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultPurchaseCost?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultSalePrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number | null;
}

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  includeArchived?: boolean;
}
