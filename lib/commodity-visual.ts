// Small, stdlib-only lookup: maps a commodity name to a display icon/gradient
// for catalog cards. No external images, so no remote-image config or
// copyright risk — adequate for a produce catalog of three items.
export const COMMODITY_VISUAL: Record<string, { emoji: string; from: string; to: string }> = {
  Tomat: { emoji: "🍅", from: "from-red-400", to: "to-orange-300" },
  Sawi: { emoji: "🥬", from: "from-lime-400", to: "to-emerald-300" },
  Kubis: { emoji: "🥦", from: "from-emerald-400", to: "to-teal-300" },
};

export function getCommodityVisual(name: string) {
  return COMMODITY_VISUAL[name] ?? { emoji: "🌾", from: "from-emerald-400", to: "to-lime-300" };
}
