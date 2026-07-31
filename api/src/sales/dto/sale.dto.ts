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
import { PaymentStatus, SaleStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// One line on a sale. lineTotal is NOT accepted from the client — the
// service recomputes it (spec §37.14 / phase-5 §3 step 3). The whitelist
// pipe strips any client-supplied lineTotal or totalAmount before it
// reaches the service.
export class CreateSaleItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  // ≥ 0 (not > 0): a genuinely free/gift line is legal, per schema-review.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;
}

// Inline customer creation used when the shop clerk hits "New customer"
// mid-sale. Phone is optional per spec §18.2.
export class NewCustomerDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;
}

export class CreateSaleDto {
  // For OWNER: which shop this sale belongs to. For SHOP, the value is
  // silently substituted with the session's assignedShopId by the guard
  // — the client is never trusted to declare its own scope (D-014 /
  // architecture §4).
  @IsString()
  @MinLength(1)
  shopId!: string;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  // Either an existing customerId, or an inline newCustomer, or neither
  // (only legal when amountPaidAtSale ≥ totalAmount — enforced in service).
  @IsOptional()
  @IsString()
  @MinLength(1)
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewCustomerDto)
  newCustomer?: NewCustomerDto;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountPaidAtSale!: number;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}

// One line in an OWNER edit payload. The itemId anchors the update to
// an existing SaleItem row — no new items are created, no items are
// deleted (spec §37.15 book-correction scope). quantity + unitPrice are
// the only editable fields; lineTotal is recomputed by the service.
export class UpdateSaleItemDto {
  @IsString()
  @MinLength(1)
  itemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;
}

// OWNER-only edit (P6-13). saleDate, notes, and per-item quantity/price
// are all optional patches. Items array (if present) must cover exactly
// the existing SaleItems — same set of itemIds, no add, no remove.
export class UpdateSaleDto {
  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items?: UpdateSaleItemDto[];
}

// Cancelling a sale (P6-10, P6-11). Reason is mandatory (spec §25) so
// the audit trail always answers "why did this sale disappear from
// active totals". Trimmed; empty strings after trim fail validation.
export class CancelSaleDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ListSalesQueryDto extends PaginationQueryDto {
  // OWNER can filter to a specific shop; SHOP requests get theirs
  // substituted by the guard.
  @IsOptional()
  @IsString()
  shopId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string')
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    if (Array.isArray(value)) return value;
    return value;
  })
  @IsEnum(PaymentStatus, { each: true })
  paymentStatus?: PaymentStatus[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string')
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    if (Array.isArray(value)) return value;
    return value;
  })
  @IsEnum(SaleStatus, { each: true })
  status?: SaleStatus[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
