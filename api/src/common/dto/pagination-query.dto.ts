import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Shared query-string base for list endpoints.
// Offset pagination; server caps pageSize so a client can't ask for the world.
// See docs/phases/phase-2.md §2.

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
}
