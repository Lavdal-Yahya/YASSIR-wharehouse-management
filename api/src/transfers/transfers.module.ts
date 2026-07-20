import { Module } from '@nestjs/common';
import { TransferReversalService } from './transfer-reversal.service';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService, TransferReversalService],
  exports: [TransfersService, TransferReversalService],
})
export class TransfersModule {}
