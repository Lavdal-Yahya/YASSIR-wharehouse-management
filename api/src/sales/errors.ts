import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors for sales (Phase 5). Codes are stable, double as
// frontend i18n keys (architecture §3.9), and are the *only* place the
// service raises money-related conflicts — bare HttpException is banned
// here so the UI can localize every possible failure (spec §38.5).
//
// INSUFFICIENT_STOCK for the shop side is not re-declared: it surfaces
// straight from the inventory chokepoint with the productId + available,
// which is exactly what the confirmation screen needs to render "The
// available quantity is only N".

export class SaleNoItemsError extends DomainError {
  readonly code = 'SALE_NO_ITEMS';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor() {
    super('A sale must contain at least one item');
  }
}

export class DuplicateSaleItemError extends DomainError {
  readonly code = 'DUPLICATE_SALE_ITEM';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  readonly productId: string;
  constructor(productId: string) {
    super(`Duplicate product ${productId} in sale items — merge the lines`);
    this.productId = productId;
  }
}

// Server-side check after totalAmount is computed. The client is never
// allowed to submit amountPaidAtSale > totalAmount — the DB CHECK also
// enforces it, but this fires first with a specific code.
export class PaymentExceedsTotalError extends DomainError {
  readonly code = 'PAYMENT_EXCEEDS_TOTAL';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly totalAmount: number;
  readonly amountPaidAtSale: number;
  constructor(totalAmount: number, amountPaidAtSale: number) {
    super(
      `amountPaidAtSale ${amountPaidAtSale} exceeds totalAmount ${totalAmount}`,
    );
    this.totalAmount = totalAmount;
    this.amountPaidAtSale = amountPaidAtSale;
  }
}

// Debt without a named customer is unrepresentable both here and at the
// DB CHECK (sale_debt_requires_customer). Spec rule §37.7.
export class CustomerRequiredError extends DomainError {
  readonly code = 'CUSTOMER_REQUIRED';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('A customer is required because part of the sale remains unpaid');
  }
}

export class SaleShopArchivedError extends DomainError {
  readonly code = 'SALE_SHOP_ARCHIVED';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly shopId: string;
  constructor(shopId: string) {
    super(`Shop ${shopId} is archived`);
    this.shopId = shopId;
  }
}

export class SaleNotFoundError extends DomainError {
  readonly code = 'SALE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  readonly saleId: string;
  constructor(saleId: string) {
    super(`Sale ${saleId} not found`);
    this.saleId = saleId;
  }
}
