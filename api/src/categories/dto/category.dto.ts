import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCategoryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

export class ListCategoriesQueryDto extends PaginationQueryDto {
  // Owner only — enforced in the controller by @Roles + service.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value === 'true' : Boolean(value),
  )
  @IsBoolean()
  includeArchived?: boolean;
}
