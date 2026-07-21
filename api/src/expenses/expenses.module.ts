import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

// Expenses are the one write path in Phase 7 (spec §26). Reports live
// separately in the ReportsModule — that module reads Expense along
// with Sale / CustomerPayment through the shared filter layer.

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
