import { Module } from '@nestjs/common';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService],
  exports: [StockReceiptsService],
})
export class StockReceiptsModule {}
