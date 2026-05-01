/* ─── Color tokens ──────────────────────────────────────────────── */
export const GOLD        = "#C9A227";
export const GOLD_LIGHT  = "#F0CE6A";
export const GOLD_BG     = "#C9A22718";
export const GOLD_BORDER = "#C9A22745";
export const ACCENT      = "#2A6496";
export const ACCENT_SOFT = "#D6E8FA";
export const ACCENT_DIM  = "#152B52";
export const SURFACE     = "#0D1F3C";
export const BG          = "#06101F";
export const TEXT        = "#D6E8FA";
export const TEXT_DIM    = "#6E96C0";

/* ─── Holding palette ───────────────────────────────────────────── */
export const HOLDING_COLORS = [
  "#C9A227","#2A6496","#059669","#7C3AED",
  "#DC2626","#EA580C","#0891B2","#4F46E5",
  "#16A34A","#DB2777",
];

/* ─── Formatters ────────────────────────────────────────────────── */
export const fmt$ = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const fmtPct = (n, digits = 1) =>
  `${n >= 0 ? "+" : ""}${Number(n).toFixed(digits)}%`;

/* ─── Portfolio enrichment ──────────────────────────────────────── */
export function enrichPortfolio(portfolio, prices) {
  if (!portfolio) return null;
  const cash = parseFloat(portfolio.cash || 0);
  let totalValue = cash, totalCost = cash;
  const holdings = (portfolio.holdings || []).map((h) => {
    const cp  = parseFloat(prices[h.symbol] || h.avg_cost || 0);
    const val = h.shares * cp;
    const cb  = h.shares * parseFloat(h.avg_cost || 0);
    totalValue += val;
    totalCost  += cb;
    return { ...h, currentPrice: cp, currentValue: val, costBasis: cb,
             gainLoss: val - cb, gainLossPct: cb > 0 ? (val - cb) / cb * 100 : 0 };
  });
  const withPct = holdings.map((h) => ({
    ...h,
    currentPct: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
    drift:      totalValue > 0 ? (h.currentValue / totalValue) * 100 - (h.target_pct || 0) : 0,
  }));
  return {
    holdings: withPct, totalValue, totalCost,
    gainLoss:    totalValue - totalCost,
    gainLossPct: totalCost > 0 ? (totalValue - totalCost) / totalCost * 100 : 0,
    cash, cashPct: totalValue > 0 ? cash / totalValue * 100 : 0,
  };
}
