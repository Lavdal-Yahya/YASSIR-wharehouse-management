import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { SessionUser } from '../../common/types/session-user';
import type { ReportFilterDto } from '../dto/report-filter.dto';

// Resolves a client-supplied report filter against the caller's role.
// Every report calls this once at the top so shop-scoping and
// date-bounding are done in exactly one place (advisor flag #6).
//
// Rules:
//   * SHOP → shopId is forced to user.assignedShopId. Any client-
//     supplied shopId is IGNORED (silently rewritten), matching the
//     ShopScopeGuard convention for write endpoints. A SHOP user
//     without an assignedShopId gets 403 (data invariant should make
//     this unreachable — the users service enforces it — but defend
//     anyway).
//   * WAREHOUSE → never appears on shop/sales/debt reports; only
//     warehouse-facing reports admit it. Enforcement is on the
//     controller via @Roles; this function does not gate role/route
//     compatibility.
//   * OWNER → filter passes through unchanged.
//
// Dates:
//   * `from` becomes an inclusive lower bound (start-of-day 00:00 UTC).
//   * `to` becomes an inclusive upper bound (end-of-day 23:59:59.999
//     UTC) so a filter like "today" catches records timestamped at
//     23:59 without the caller doing +1 day. UTC-bucketing is D-015.
//   * Both are optional; missing means "no bound on that side".
//   * `outstanding` reports MUST NOT use `from` (a debt sale from
//     before the range still counts). Those reports call the
//     alternate resolver that strips `from` — see
//     resolveOutstandingScope below.

export type ReportScope = {
  shopId: string | null; // null means "any / all shops" (OWNER)
  from: Date | null;
  to: Date | null;
};

export function resolveReportScope(
  user: SessionUser,
  filter: ReportFilterDto,
): ReportScope {
  const shopId = resolveShopId(user, filter.shopId ?? null);
  return {
    shopId,
    from: startOfDayUtc(filter.from),
    to: endOfDayUtc(filter.to),
  };
}

// Outstanding is an "as-of" quantity, not date-bound. Applying `from`
// would silently drop debt sales created before the window even though
// the customer still owes. `to` is legal — "outstanding as of end of
// last month" is meaningful. This helper enforces both in the type
// signature: no `from` field on the return.
export type OutstandingScope = {
  shopId: string | null;
  asOf: Date | null; // upper bound; null = current
};

export function resolveOutstandingScope(
  user: SessionUser,
  filter: ReportFilterDto,
): OutstandingScope {
  return {
    shopId: resolveShopId(user, filter.shopId ?? null),
    asOf: endOfDayUtc(filter.to),
  };
}

function resolveShopId(user: SessionUser, requested: string | null): string | null {
  if (user.role === Role.SHOP) {
    if (!user.assignedShopId) {
      throw new ForbiddenException('Shop user has no assigned shop');
    }
    return user.assignedShopId;
  }
  return requested;
}

function startOfDayUtc(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  // Preserve the caller's UTC-day intention: "2026-07-15" → 00:00 UTC
  // that day. If they supplied a full timestamp, respect it.
  if (isDateOnly(iso)) {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
    );
  }
  return d;
}

function endOfDayUtc(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isDateOnly(iso)) {
    return new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }
  return d;
}

// Matches "2026-07-15" (date-only). Anything with a T or timezone
// component is treated as an instant the caller already precisely
// chose.
function isDateOnly(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}
