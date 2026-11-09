import { Suspense } from "react";
import { SiteHeaderClient } from "./site-header-client";
import { AccountStatus } from "./account-status";

// A skeleton the same size as the real account slot, shown while the auth
// cookie read in AccountStatus streams in behind this Suspense boundary —
// keeps pages that render SiteHeader prerenderable instead of fully dynamic.
function AccountStatusFallback() {
  return <div aria-hidden="true" className="ml-1 h-10 w-20 animate-pulse rounded-xl bg-emerald-100" />;
}

export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  return (
    <SiteHeaderClient
      cartCount={cartCount}
      account={
        <Suspense fallback={<AccountStatusFallback />}>
          <AccountStatus />
        </Suspense>
      }
    />
  );
}
