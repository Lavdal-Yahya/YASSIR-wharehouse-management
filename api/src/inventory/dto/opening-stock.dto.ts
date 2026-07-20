import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class OpeningStockItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

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

export class CreateOpeningStockDto {
  @IsString()
  @MinLength(1)
  locationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningStockItemDto)
  items!: OpeningStockItemDto[];
}
