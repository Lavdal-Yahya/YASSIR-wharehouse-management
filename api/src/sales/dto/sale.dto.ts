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
