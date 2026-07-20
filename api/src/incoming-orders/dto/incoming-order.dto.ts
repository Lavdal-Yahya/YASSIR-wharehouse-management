import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Inline product creation during an order (spec §11.2, phase-3 §3). Only
// name + categoryId are required — mirrors CreateProductDto. Prices and
// low-stock threshold optional.
export class InlineNewProductDto {
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

// One order line. Exactly one of productId | newProduct must be supplied;
// enforced in the service so the error message is meaningful.
export class CreateIncomingOrderItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InlineNewProductDto)
  newProduct?: InlineNewProductDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityOrdered!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CreateIncomingOrderDto {
  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  supplierName?: string | null;

  @IsDateString()
  orderDate!: string;

  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateIncomingOrderItemDto)
  items!: CreateIncomingOrderItemDto[];
}

// Only these three fields are editable, and only while the order is neither
// RECEIVED nor CANCELLED (phase-3 §3). Everything else is history.
export class UpdateIncomingOrderDto {
  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  supplierName?: string | null;

  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CancelIncomingOrderDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ListIncomingOrdersQueryDto extends PaginationQueryDto {
  // status accepts a single value or a comma-separated list (?status=ORDERED,SHIPPED).
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
    if (Array.isArray(value)) return value;
    return value;
  })
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
