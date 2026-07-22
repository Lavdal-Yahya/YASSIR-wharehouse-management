// Cart state — a reducer, not per-line useState. Every "the moment when
// X" from the design brief (customer required when remaining > 0, price
// changes, product exhausts) is a state transition; a reducer keeps
// those transitions explicit and audit-in-one-place.

export type CartItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  availableQty: number;
  suggestedSalePrice: number | null;
};

export type ExistingCustomer = {
  kind: 'existing';
  id: string;
  name: string;
  phone: string | null;
};

export type NewCustomer = {
  kind: 'new';
  name: string;
  phone: string | null;
};

export type CustomerChoice = ExistingCustomer | NewCustomer;

export type CartState = {
  /** cart = pick/edit lines; payment = paid-now + customer + confirm. */
  step: 'cart' | 'payment';
  shopId: string;
  locationId: string;
  items: CartItem[];
  /** Whole MRU. Server rejects > totalAmount; the UI keeps it bounded via clamp on set. */
  amountPaidAtSale: number;
  customer: CustomerChoice | null;
};

export type CartAction =
  | { type: 'SET_STEP'; step: 'cart' | 'payment' }
  | { type: 'SET_SHOP'; shopId: string; locationId: string }
  | {
      type: 'ADD_LINE';
      product: {
        id: string;
        name: string;
        availableQty: number;
        suggestedSalePrice: number | null;
      };
    }
  | { type: 'SET_QTY'; productId: string; quantity: number }
  | { type: 'SET_PRICE'; productId: string; unitPrice: number }
  | { type: 'REMOVE_LINE'; productId: string }
  | { type: 'SET_PAID_NOW'; amount: number }
  | { type: 'PAY_FULL' }
  | { type: 'SET_EXISTING_CUSTOMER'; id: string; name: string; phone: string | null }
  | { type: 'SET_NEW_CUSTOMER'; name: string; phone: string | null }
  | { type: 'CLEAR_CUSTOMER' }
  | { type: 'RESET'; shopId: string; locationId: string };

export function initialCartState(
  shopId = '',
  locationId = '',
): CartState {
  return {
    step: 'cart',
    shopId,
    locationId,
    items: [],
    amountPaidAtSale: 0,
    customer: null,
  };
}

export function totalAmount(items: CartItem[]): number {
  let total = 0;
  for (const it of items) total += it.quantity * it.unitPrice;
  return total;
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SET_SHOP':
      // Changing shop wipes the cart — a product in one shop's stock may
      // not exist in the other's; safer than silently offering to
      // migrate lines.
      return initialCartState(action.shopId, action.locationId);

    case 'RESET':
      return initialCartState(action.shopId, action.locationId);

    case 'ADD_LINE': {
      const existing = state.items.find((it) => it.productId === action.product.id);
      if (existing) {
        // Bump the quantity by 1 if within stock, otherwise leave.
        if (existing.quantity + 1 > existing.availableQty) return state;
        return {
          ...state,
          items: state.items.map((it) =>
            it.productId === action.product.id
              ? { ...it, quantity: it.quantity + 1 }
              : it,
          ),
        };
      }
      const line: CartItem = {
        productId: action.product.id,
        name: action.product.name,
        quantity: 1,
        unitPrice: action.product.suggestedSalePrice ?? 0,
        availableQty: action.product.availableQty,
        suggestedSalePrice: action.product.suggestedSalePrice,
      };
      return { ...state, items: [...state.items, line] };
    }

    case 'SET_QTY': {
      const qty = Math.max(1, Math.floor(action.quantity));
      return {
        ...state,
        items: state.items.map((it) =>
          it.productId === action.productId
            ? { ...it, quantity: Math.min(qty, it.availableQty) }
            : it,
        ),
      };
    }

    case 'SET_PRICE': {
      const price = Math.max(0, Math.floor(action.unitPrice));
      const next = state.items.map((it) =>
        it.productId === action.productId ? { ...it, unitPrice: price } : it,
      );
      // If the total drops below the "paid now" figure, clamp the paid-now
      // so it stays valid. Server rejects > total anyway.
      const nextTotal = totalAmount(next);
      const paid = Math.min(state.amountPaidAtSale, nextTotal);
      return { ...state, items: next, amountPaidAtSale: paid };
    }

    case 'REMOVE_LINE': {
      const next = state.items.filter((it) => it.productId !== action.productId);
      const paid = Math.min(state.amountPaidAtSale, totalAmount(next));
      return { ...state, items: next, amountPaidAtSale: paid };
    }

    case 'SET_PAID_NOW': {
      const total = totalAmount(state.items);
      const amount = Math.max(0, Math.min(action.amount, total));
      return { ...state, amountPaidAtSale: amount };
    }

    case 'PAY_FULL':
      return { ...state, amountPaidAtSale: totalAmount(state.items) };

    case 'SET_EXISTING_CUSTOMER':
      return {
        ...state,
        customer: {
          kind: 'existing',
          id: action.id,
          name: action.name,
          phone: action.phone,
        },
      };

    case 'SET_NEW_CUSTOMER':
      return {
        ...state,
        customer: {
          kind: 'new',
          name: action.name,
          phone: action.phone,
        },
      };

    case 'CLEAR_CUSTOMER':
      return { ...state, customer: null };

    default:
      return state;
  }
}
