import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CreateCustomerDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateCustomerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ListCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  includeArchived?: boolean;
}
