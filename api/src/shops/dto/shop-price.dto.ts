import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

// Body of PUT /shops/:shopId/prices/:productId. salePrice is whole MRU
// (D-004), must be non-negative. DELETE on the same URL clears the
// override; no separate flag needed.
export class UpsertShopPriceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salePrice!: number;
}
