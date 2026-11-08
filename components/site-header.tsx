import { SiteHeaderClient } from "./site-header-client";

export function SiteHeader({ cartCount = 0 }: { cartCount?: number }) {
  return <SiteHeaderClient cartCount={cartCount} />;
}
