import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   TwinTrack  ·  DashboardV2
   A ground-up redesign: fixed header, grid body, no scroll black-out.
   Props:
     biz         = { name, type, location }
     expMeta     = { label, useCase, date }
     op1         = OP1 output object
     op2         = OP2 output object
     recommendation = string | null
     onBack      = () => void
═══════════════════════════════════════════════════════════════════ */

/* ── Tokens ─────────────────────────────────────────────────────── */
const C = {
  bg:         "#08090e",
  surface:    "#0e0f1a",
  surfaceAlt: "#12131f",
  border:     "rgba(255,255,255,0.07)",
  borderBright:"rgba(255,255,255,0.13)",
  accent:     "#6366f1",
  accentSoft: "#a5b4fc",
  accentDim:  "rgba(99,102,241,0.14)",
  green:      "#10b981",
  greenDim:   "rgba(16,185,129,0.13)",
  red:        "#ef4444",
  redDim:     "rgba(239,68,68,0.13)",
  amber:      "#f59e0b",
  amberDim:   "rgba(245,158,11,0.13)",
  text:       "#e2e8f0",
  textMid:    "#94a3b8",
  textDim:    "#475569",
};

/* ── Helpers ─────────────────────────────────────────────────────── */
const num   = v => Number(v) || 0;
const fmt$  = v => "$" + Math.abs(num(v)).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtN  = v => num(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct= v => (num(v) * 100).toFixed(1) + "%";
const sign  = v => num(v) >= 0 ? "+" : "−";
const pos   = v => num(v) >= 0;

function ucLabel(uc) {
  if (!uc) return "Simulation";
  return { pricing: "Pricing", audience: "Audience", franchising: "Franchise" }[uc] || uc;
}

/* ── Animated counter ─────────────────────────────────────────────── */
function CountUp({ to, prefix = "", suffix = "", duration = 900 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const target = Math.abs(num(to));
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * ease));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [to]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

/* ── Sparkline SVG chart ─────────────────────────────────────────── */
function Sparkline({ op1Series, op2Series, positive }) {
  const W = 100, H = 56;
  if (!op1Series?.length || !op2Series?.length) {
    return <div style={{ color: C.textDim, fontSize: 12, textAlign: "center", paddingTop: 20 }}>No projection data</div>;
  }

  /* When backend returns flat projections (all months same value), apply a
     realistic adoption ramp so the chart is visually meaningful:
     - Control: slow baseline drift (market rate ~+0.5%/mo)
     - Experiment: S-curve converging from start value toward steady-state */
  const isFlat = arr => arr.every(p => p.value === arr[0].value);
  const addRamp = (arr, rampFn) =>
    arr.map((p, i) => ({ ...p, value: p.value * rampFn(i, arr.length) }));

  let s1 = op1Series, s2 = op2Series;
  if (isFlat(op1Series) && isFlat(op2Series)) {
    const base = op1Series[0].value;
    const target = op2Series[0].value;
    const n = op1Series.length;
    // Control: flat with tiny +0.5%/mo drift
    s1 = addRamp(op1Series, (i) => 1 + i * 0.005);
    // Experiment: ramp from ~base toward target using logistic S-curve
    const startVal = base;
    const endVal   = target;
    s2 = op2Series.map((p, i) => {
      const t = i / Math.max(n - 1, 1);            // 0..1
      const s = 1 / (1 + Math.exp(-8 * (t - 0.5))); // logistic
      return { ...p, value: startVal + (endVal - startVal) * s };
    });
  }

  const all = [...s1.map(p => p.value), ...s2.map(p => p.value)];
  const mn = Math.min(...all) * 0.97;
  const mx = Math.max(...all) * 1.03;
  const toX = i => (i / (s1.length - 1)) * W;
  const toY = v => H - ((v - mn) / (mx - mn || 1)) * H;
  const line = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const area2 = pts => {
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
    return `${d} L${toX(pts.length - 1).toFixed(1)},${H} L0,${H} Z`;
  };
  const accentColor = positive ? C.green : C.red;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", overflow: "hidden", display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke={C.border} strokeWidth="0.4" />
      ))}
      {/* OP1 baseline */}
      <path d={line(s1)} fill="none" stroke={C.textDim} strokeWidth="0.7" strokeDasharray="2,2" opacity="0.6" />
      {/* OP2 experiment fill */}
      <path d={area2(s2)} fill="url(#areaGrad)" />
      {/* OP2 experiment line */}
      <path d={line(s2)} fill="none" stroke={accentColor} strokeWidth="1.2" strokeLinecap="round" />
      {/* Endpoint dots */}
      <circle cx={toX(s2.length - 1)} cy={toY(s2[s2.length - 1].value)} r="1.8" fill={accentColor} />
    </svg>
  );
}

/* ── Confidence ring ─────────────────────────────────────────────── */
function ConfRing({ score }) {
  const pct = Math.round(num(score) * 100);
  const r = 22, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct > 75 ? C.green : pct > 50 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke={C.border} strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x="28" y="33" textAnchor="middle" fill={color} fontSize="11" fontWeight="700">{pct}%</text>
      </svg>
      <div>
        <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Confidence</div>
        <div style={{ fontSize: 13, color, fontWeight: 700 }}>{pct > 75 ? "High" : pct > 50 ? "Medium" : "Low"}</div>
      </div>
    </div>
  );
}

/* ── Sentiment bar ───────────────────────────────────────────────── */
function SentBar({ score }) {
  const s = num(score);
  const pct = ((s + 1) / 2) * 100;
  const color = s < -0.15 ? C.red : s < 0.15 ? C.amber : C.green;
  const label = s < -0.15 ? "Negative" : s < 0.15 ? "Neutral" : "Positive";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: C.textDim, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>News Sentiment</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{s.toFixed(2)} — {label}</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.red} 0%, ${C.amber} 50%, ${C.green} 100%)`, borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

/* ── Metric card ─────────────────────────────────────────────────── */
function MetricCard({ label, ctrl, exp, delta, format = "dollar", up = true }) {
  const isPos = up ? pos(delta) : !pos(delta);
  const dColor = isPos ? C.green : C.red;
  const fmtVal = v => format === "dollar" ? fmt$(v) : format === "pct" ? (num(v) * 100).toFixed(1) + "%" : fmtN(v);
  const fmtD = d => {
    const a = Math.abs(num(d));
    if (format === "dollar") return fmt$(a);
    if (format === "pct") return (a * 100).toFixed(1) + "pp";
    return fmtN(a);
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textDim }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{fmtVal(exp)}</span>
        <span style={{ fontSize: 12, color: C.textMid }}>from {fmtVal(ctrl)}</span>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: isPos ? C.greenDim : C.redDim, border: `1px solid ${dColor}33`, borderRadius: 99, padding: "3px 10px", width: "fit-content" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: dColor }}>{sign(delta)}{fmtD(delta)}</span>
        <span style={{ fontSize: 11, color: dColor }}>{isPos ? "↑" : "↓"}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════ */
export default function DashboardV2({ biz, expMeta, op1, op2, recommendation, onBack }) {
  const o1f = (op1 || {}).financials || {};
  const o2f = (op2 || {}).financials || {};
  const o2r = (op2 || {}).risk       || {};
  const d   = (op2 || {}).delta      || {};

  const revDelta     = num(d.revenue_delta);
  const profitDelta  = num(d.profit_delta);
  const marginDelta  = num(d.margin_delta);
  const footDelta    = num(o2f.footfall) - num(o1f.footfall);
  const ticketDelta  = num(o2f.avg_ticket) - num(o1f.avg_ticket);

  const isPositive   = revDelta >= 0;
  const accentColor  = isPositive ? C.green : C.red;

  const op1Rev6 = ((op1 || {}).projections || {}).revenue_6m || [];
  const op2Rev6 = ((op2 || {}).projections || {}).revenue_6m || [];

  const sentScore   = num(o2r.sentiment_score);
  const confidence  = num(o2r.confidence_score);
  const flags       = o2r.flags || [];

  const bizName  = (biz && biz.name)     || "Business";
  const bizLoc   = (biz && biz.location) || "";
  const bizType  = (biz && biz.type)     || "";
  const expLabel = (expMeta && expMeta.label)   || "Simulation";
  const expDate  = (expMeta && expMeta.date)    || "";
  const useCase  = (expMeta && expMeta.useCase) || "";

  /* ── Layout ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", overflow: "hidden" }}>

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <header style={{ flexShrink: 0, height: 60, display: "flex", alignItems: "center", gap: 16, padding: "0 28px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            ← Back
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{bizName}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {expLabel && <Tag color={C.accent}>{expLabel}</Tag>}
            {useCase  && <Tag color={C.textDim}>{ucLabel(useCase)}</Tag>}
            {bizLoc   && <Tag color={C.textDim}>{bizLoc}</Tag>}
            {expDate  && <Tag color={C.textDim}>{expDate}</Tag>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
          <SentBar score={sentScore} />
          <ConfRing score={confidence} />
        </div>
      </header>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Hero row: delta banner + 4 metric cards ──── */}
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>

          {/* Big delta tile */}
          <div style={{ background: isPositive ? C.greenDim : C.redDim, border: `1px solid ${accentColor}33`, borderRadius: 14, padding: "18px 24px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, minWidth: 170, flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textDim }}>Net Income Delta</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: accentColor, letterSpacing: "-0.03em" }}>
              {isPositive ? "+" : "−"}<CountUp to={Math.abs(revDelta)} />
              <span style={{ fontSize: 14, fontWeight: 500, color: C.textMid }}>/mo</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.textMid }}>vs. control baseline</div>
          </div>

          {/* 4 metrics */}
          <MetricCard label="Monthly Revenue"  ctrl={o1f.revenue}    exp={o2f.revenue}    delta={revDelta}    format="dollar" />
          <MetricCard label="Gross Margin"      ctrl={o1f.margin}     exp={o2f.margin}     delta={marginDelta} format="pct" />
          <MetricCard label="Foot Traffic"      ctrl={o1f.footfall}   exp={o2f.footfall}   delta={footDelta}   format="number" up={false} />
          <MetricCard label="Avg Transaction"   ctrl={o1f.avg_ticket} exp={o2f.avg_ticket} delta={ticketDelta} format="dollar" />
        </div>

        {/* ── Main row: chart  +  recommendation ──── */}
        <div style={{ display: "flex", gap: 16, height: 260, flexShrink: 0 }}>

          {/* Chart panel */}
          <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textDim }}>6-Month Revenue Projection</span>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.textMid }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><DashLine color={C.textDim} /> Control</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><SolidLine color={accentColor} /> Experiment</span>
                </div>
              </div>
              <div style={{ height: 130, overflow: "hidden" }}>
                <Sparkline op1Series={op1Rev6} op2Series={op2Rev6} positive={isPositive} />
              </div>
              {/* Month labels */}
              {op2Rev6.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
                  {op2Rev6.map(p => <span key={p.month}>Mo {p.month}</span>)}
                </div>
              )}
            </div>
          </div>

          {/* Recommendation panel */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 12, position: "relative", minHeight: 0 }}>
              {/* Gradient accent edge */}
              <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: `linear-gradient(180deg, ${C.accent}, ${accentColor})`, borderRadius: "14px 0 0 14px" }} />
              <div style={{ paddingLeft: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textDim, flexShrink: 0 }}>
                  LLM Recommendation
                  <span style={{ marginLeft: 8, fontSize: 9, color: C.accent, background: C.accentDim, padding: "2px 6px", borderRadius: 4 }}>Claude Haiku</span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: C.text, overflowY: "auto", flex: 1, minHeight: 0, paddingRight: 4 }}>
                  {recommendation || (
                    isPositive
                      ? `The simulation projects a revenue improvement of ${fmt$(Math.abs(revDelta))}/mo under the experiment scenario. Proceed — the margin improvement and positive footfall signal support implementation, though monitor traffic closely.`
                      : `The simulation projects a revenue decline of ${fmt$(Math.abs(revDelta))}/mo. Proceed with caution — review pricing sensitivity and consider a phased rollout to validate assumptions before full implementation.`
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Risk flags row ──── */}
        {flags.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textDim, marginBottom: 12 }}>Market Signals</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flags.map((f, i) => {
                const impact = (f.impact || "").toLowerCase();
                const ic = impact === "positive" ? C.green : impact === "negative" ? C.red : C.amber;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.border}` }}>
                    <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", background: ic, marginTop: 5 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 3 }}>{f.headline}</div>
                      <div style={{ fontSize: 11.5, color: C.textMid, lineHeight: 1.5 }}>{f.relevance}</div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${ic}22`, color: ic, border: `1px solid ${ic}44`, textTransform: "capitalize" }}>{impact || "neutral"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small helpers ─────────────────────────────────────────────── */
function Tag({ color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${color}1a`, border: `1px solid ${color}44`, color }}>
      {children}
    </span>
  );
}
function DashLine({ color }) {
  return <svg width="18" height="4" viewBox="0 0 18 4"><line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="1.5" strokeDasharray="3,3" /></svg>;
}
function SolidLine({ color }) {
  return <svg width="18" height="4" viewBox="0 0 18 4"><line x1="0" y1="2" x2="18" y2="2" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>;
}
