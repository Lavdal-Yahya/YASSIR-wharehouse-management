import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExpenseCategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

export class ListExpenseCategoriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  includeArchived?: boolean;
}
