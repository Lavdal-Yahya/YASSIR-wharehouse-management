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
import { CustomerPaymentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

// Registering a customer debt payment (P6-02).
//
// * amount is an integer (whole MRU, D-004) and MUST be > 0 — the DB
//   payment_amount_positive CHECK is the last-line backstop.
// * shopId is silently substituted for SHOP users by ShopScopeGuard;
//   OWNER passes it explicitly (which shop received the cash).
// * targetSaleId is the OWNER-only escape hatch (P6-03) — the guard
//   does not gate on role here; the service rejects a SHOP request
//   that carries it (avoiding a silent ignore).
export class RegisterPaymentDto {
  @IsString()
  @MinLength(1)
  customerId!: string;

  @IsString()
  @MinLength(1)
  shopId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  // OWNER-only. Directs the ENTIRE amount at one sale; overflow
  // (amount > that sale's amountDue) is rejected — the owner picks a
  // smaller amount rather than get an implicit split (spec §21.3).
  @IsOptional()
  @IsString()
  @MinLength(1)
  targetSaleId?: string;
}

// Reversing an ACTIVE payment (P6-04). OWNER only at the controller;
// the reason is mandatory (spec §25) so the audit trail always answers
// "why did this money movement disappear from the totals".
export class ReversePaymentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ListPaymentsQueryDto extends PaginationQueryDto {
  // OWNER can filter to a shop; SHOP users get theirs substituted by the guard.
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
  @IsEnum(CustomerPaymentStatus, { each: true })
  status?: CustomerPaymentStatus[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
