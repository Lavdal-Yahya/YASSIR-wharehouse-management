import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

// The one shared shape every report accepts. `from`/`to` are
// UTC-bucketed (D-015) — Mauritania is UTC+0, so business day == UTC
// day. Both dates are inclusive lower bound and inclusive upper bound
// respectively at the DB layer; the resolver widens `to` to end-of-day
// so filters like "today" work at whole-day granularity without the
// caller doing the +1-day trick.
//
// `shopId` is honoured for OWNER only; a SHOP user gets their own
// shop substituted by resolveReportScope (no client-supplied shop
// scope ever survives for SHOP — spec §29.3).

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ReportFilterDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  shopId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
