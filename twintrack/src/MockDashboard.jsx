import { useState } from "react";

/* ─── Mock Data ─────────────────────────────────────────────────── */
const BIZ = { name: "Riverside Bakery Co.", type: "Bakery / baked goods retail", location: "Dallas, TX", id: "biz-0042" };
const EXP_META = { label: "Q3 Price Increase +10%", useCase: "Pricing", date: "Apr 12, 2026", sentimentScore: -0.31 };
const CTRL = { revenue: 14200, margin: 28.0, footTraffic: 1840, avgTicket: 8.40, netIncome: 3200, laborPct: 34.0 };
const EXPT = { revenue: 15100, margin: 31.2, footTraffic: 1690, avgTicket: 9.20, netIncome: 4100, laborPct: 33.1 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const CTRL_R  = [14200, 14350, 14100, 14500, 14200, 14400];
const EXPT_R  = [15100, 15250, 14850, 15600, 15200, 15450];

const FLAGS = [
  { sev: "high",   icon: "▲", label: "Consumer Spending",  text: "Discretionary spending ↓2.1% in DFW MSA — price sensitivity elevated for F&B", source: "BLS Apr 2026" },
  { sev: "high",   icon: "▲", label: "Input Costs",        text: "Flour wholesale index up 7.2% YoY — sustained COGS pressure", source: "FRED" },
  { sev: "low",    icon: "▼", label: "Competitive Gap",    text: "3 local competitors shuttered Q1 2026 — reduced substitution risk in trade zone", source: "NewsAPI" },
];

const RECO = [
  "The simulation projects net income improvement of +$900/mo (+28.1%), driven by higher per-ticket revenue and a 3.2pp gross margin expansion — partially offset by an estimated −8.1% reduction in weekly foot traffic.",
  "Key risk: Consumer sentiment in DFW is −0.31 (Slightly Negative), amplifying price elasticity. If foot traffic decline exceeds −10%, total revenue gain erodes.",
  "Recommendation: Phase the increase — raise beverages and specialty items first (+10–12%), hold core bread SKUs at +4–5%. Re-run simulation in 60 days against live OP1 baseline and adjust accordingly.",
];

/* ─── Styles ─────────────────────────────────────────────────────── */
const A = "#2563eb";
const AS = "#60a5fa";

const s = {
  root: { minHeight: "100vh", background: "#060c1a", color: "#c8d6f0", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", boxSizing: "border-box" },
  inner: { maxWidth: 1100, margin: "0 auto", padding: "28px 32px 64px" },
  backBtn: { display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#6080a8", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", marginBottom: 28, transition: "color 0.15s" },
  chip: (color) => ({ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em", background: color + "22", border: `1px solid ${color}44`, color }),
  section: { marginBottom: 28 },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3d5570", marginBottom: 12 },
  card: { background: "#080f20", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 22px" },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 },
  kpiCard: (highlight) => ({
    background: highlight ? "rgba(37,99,235,0.08)" : "#080f20",
    border: highlight ? "1px solid rgba(37,99,235,0.28)" : "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "18px 20px",
  }),
  panelGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 },
  panelCard: (accent) => ({
    background: accent ? "rgba(37,99,235,0.07)" : "#080f20",
    border: accent ? "1px solid rgba(37,99,235,0.22)" : "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14, padding: "20px 22px",
  }),
  deltaGreen: { color: "#34d399", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" },
  deltaRed:   { color: "#f87171", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" },
};

/* ─── Helpers ───────────────────────────────────────────────────── */
function pct(a, b) { return (((b - a) / a) * 100).toFixed(1); }
function fmtDollar(v) { return "$" + Number(v).toLocaleString(); }
function fmtNum(v) { return Number(v).toLocaleString(); }

function Delta({ ctrl, expt, fmt = (v) => v, lowerIsGood = false, suffix = "" }) {
  const d = expt - ctrl;
  const p = pct(ctrl, expt);
  const good = lowerIsGood ? d <= 0 : d >= 0;
  const chip = good ? s.deltaGreen : s.deltaRed;
  return (
    <span style={chip}>
      {d >= 0 ? "+" : ""}{fmt(d)}{suffix} ({d >= 0 ? "+" : ""}{p}%)
    </span>
  );
}

/* ─── Bar Chart ─────────────────────────────────────────────────── */
function BarChart() {
  const W = 600, H = 150;
  const padL = 48, padR = 16, padT = 12, padB = 28;
  const iW = W - padL - padR, iH = H - padT - padB;
  const dataMin = 13500, dataMax = 16200;
  const range = dataMax - dataMin;
  const groupW = iW / MONTHS.length;
  const bw = 14;
  const toY = (v) => padT + iH - ((v - dataMin) / range) * iH;
  const bH  = (v) => ((v - dataMin) / range) * iH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* Gridlines */}
      {[14000, 14500, 15000, 15500, 16000].map((v) => (
        <g key={v}>
          <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          <text x={padL - 6} y={toY(v) + 4} textAnchor="end" fill="#3d5570" fontSize={8.5}>${v / 1000}k</text>
        </g>
      ))}
      {/* Bars */}
      {MONTHS.map((m, i) => {
        const gx   = padL + i * groupW;
        const cx   = gx + groupW / 2 - bw - 3;
        const ex   = gx + groupW / 2 + 3;
        return (
          <g key={m}>
            <rect x={cx} y={toY(CTRL_R[i])}  width={bw} height={bH(CTRL_R[i])}  fill="rgba(100,130,170,0.45)" rx={3} />
            <rect x={ex} y={toY(EXPT_R[i])} width={bw} height={bH(EXPT_R[i])} fill="rgba(37,99,235,0.75)"    rx={3} />
            <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" fill="#3d5570" fontSize={9}>{m}</text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={padL}     y={padT - 4} width={10} height={10} fill="rgba(100,130,170,0.45)" rx={2} />
      <text x={padL + 14} y={padT + 5} fill="#5070a0" fontSize={9}>Control (OP1)</text>
      <rect x={padL + 90} y={padT - 4} width={10} height={10} fill="rgba(37,99,235,0.75)" rx={2} />
      <text x={padL + 104} y={padT + 5} fill={AS} fontSize={9}>Experiment (OP2)</text>
    </svg>
  );
}

/* ─── Sentiment Bar ──────────────────────────────────────────────── */
function SentimentBar({ score }) {
  const pctFill = ((score + 1) / 2) * 100;
  const color = score < -0.2 ? "#f87171" : score < 0.2 ? "#fbbf24" : "#34d399";
  const label = score < -0.2 ? "Slightly Negative" : score < 0.2 ? "Neutral" : "Positive";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pctFill}%`, background: `linear-gradient(90deg, #f87171, ${color})`, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color, flexShrink: 0 }}>{score.toFixed(2)} — {label}</span>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function MockDashboard({ onBack }) {
  const [recoOpen, setRecoOpen] = useState(true);

  return (
    <div style={s.root}>
      <div style={s.inner}>

        {/* ── Back ── */}
        <button style={s.backBtn} onClick={onBack} onMouseEnter={(e) => (e.currentTarget.style.color = AS)} onMouseLeave={(e) => (e.currentTarget.style.color = "#6080a8")}>
          ← Back to overview
        </button>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: AS, margin: "0 0 6px" }}>Simulation Results</p>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", color: "#e0eeff", margin: "0 0 8px", lineHeight: 1.15 }}>{BIZ.name}</h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                <span style={s.chip("#60a5fa")}>{EXP_META.label}</span>
                <span style={s.chip("#a78bfa")}>{EXP_META.useCase}</span>
                <span style={s.chip("#6080a8")}>{BIZ.location}</span>
                <span style={s.chip("#3d5570")}>{EXP_META.date}</span>
              </div>
            </div>
            <div style={{ ...s.card, textAlign: "right", minWidth: 180 }}>
              <p style={{ margin: "0 0 2px", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3d5570" }}>News Sentiment</p>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#4a6888" }}>DFW · {BIZ.type}</p>
              <SentimentBar score={EXP_META.sentimentScore} />
            </div>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Key Metrics — Control vs. Experiment</p>
          <div style={s.kpiGrid}>
            {[
              { label: "Monthly Revenue",  ctrl: fmtDollar(CTRL.revenue),  expt: fmtDollar(EXPT.revenue),  delta: <Delta ctrl={CTRL.revenue}  expt={EXPT.revenue}  fmt={(d) => "$" + Math.abs(d).toLocaleString()} />, highlight: true },
              { label: "Gross Margin",     ctrl: CTRL.margin + "%",         expt: EXPT.margin + "%",         delta: <Delta ctrl={CTRL.margin}   expt={EXPT.margin}   fmt={(d) => (d > 0 ? "+" : "") + d.toFixed(1) + "pp"} suffix="" />, highlight: true },
              { label: "Weekly Foot Traffic", ctrl: fmtNum(CTRL.footTraffic), expt: fmtNum(EXPT.footTraffic), delta: <Delta ctrl={CTRL.footTraffic} expt={EXPT.footTraffic} fmt={(d) => Math.abs(Math.round(d)).toLocaleString()} lowerIsGood={false} />, highlight: false },
              { label: "Avg Transaction",  ctrl: "$" + CTRL.avgTicket.toFixed(2), expt: "$" + EXPT.avgTicket.toFixed(2), delta: <Delta ctrl={CTRL.avgTicket} expt={EXPT.avgTicket} fmt={(d) => "$" + Math.abs(d).toFixed(2)} />, highlight: false },
            ].map((k) => (
              <div key={k.label} style={s.kpiCard(k.highlight)}>
                <p style={{ margin: "0 0 12px", fontSize: 11.5, fontWeight: 600, color: "#3d5570", letterSpacing: "0.03em", textTransform: "uppercase" }}>{k.label}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#5070a0", textDecoration: "line-through", textDecorationColor: "rgba(80,112,160,0.4)" }}>{k.ctrl}</span>
                  <span style={{ fontSize: 16, color: "#8a9a9a", margin: "0 2px" }}>→</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#d0e4ff", letterSpacing: "-0.02em" }}>{k.expt}</span>
                </div>
                {k.delta}
              </div>
            ))}
          </div>
        </div>

        {/* ── Net Income Highlight ── */}
        <div style={{ ...s.card, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.22)" }}>
          <div>
            <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3d5570" }}>Projected Net Income Delta</p>
            <p style={{ margin: 0, fontSize: 13, color: "#4a6888" }}>Monthly · post experiment implementation</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 800, color: "#34d399", letterSpacing: "-0.04em" }}>+$900 / mo</p>
            <span style={s.deltaGreen}>+28.1%  vs. control baseline</span>
          </div>
        </div>

        {/* ── Revenue Projection Chart ── */}
        <div style={{ ...s.section, ...s.card }}>
          <p style={{ ...s.sectionLabel, marginBottom: 16 }}>6-Month Revenue Projection</p>
          <BarChart />
        </div>

        {/* ── Panels: OP1 / OP2 ── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Full Output Comparison</p>
          <div style={s.panelGrid}>
            {/* OP1 Control */}
            <div style={s.panelCard(false)}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3d5570" }}>OP1 — Control Baseline</p>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: "#3a5468" }}>Current state · no change applied</p>
              {[
                ["Monthly revenue",    fmtDollar(CTRL.revenue)],
                ["Gross margin",       CTRL.margin + "%"],
                ["Weekly foot traffic", fmtNum(CTRL.footTraffic) + " visits"],
                ["Avg ticket",         "$" + CTRL.avgTicket.toFixed(2)],
                ["Monthly net income", fmtDollar(CTRL.netIncome)],
                ["Labor cost %",       CTRL.laborPct + "%"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12.5, color: "#3d5570" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#7090b8" }}>{v}</span>
                </div>
              ))}
            </div>
            {/* OP2 Experiment */}
            <div style={s.panelCard(true)}>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: AS }}>OP2 — Experiment Output</p>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: "#4a6888" }}>Post-decision projection · {EXP_META.label}</p>
              {[
                ["Monthly revenue",    fmtDollar(EXPT.revenue),   true,  false],
                ["Gross margin",       EXPT.margin + "%",          true,  false],
                ["Weekly foot traffic", fmtNum(EXPT.footTraffic) + " visits", false, false],
                ["Avg ticket",         "$" + EXPT.avgTicket.toFixed(2), true, false],
                ["Monthly net income", fmtDollar(EXPT.netIncome), true,  false],
                ["Labor cost %",       EXPT.laborPct + "%",        true,  true],
              ].map(([k, v, isUp]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(37,99,235,0.1)" }}>
                  <span style={{ fontSize: 12.5, color: "#4a6888" }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isUp === false && k === "Weekly foot traffic" ? "#f87171" : "#b8d8ff" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Watch Out Flags ── */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Watch Out Flags — News-Driven Risk</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FLAGS.map((f) => {
              const color = f.sev === "high" ? "#f87171" : f.sev === "medium" ? "#fbbf24" : "#34d399";
              return (
                <div key={f.label} style={{ display: "flex", gap: 14, padding: "14px 18px", borderRadius: 12, border: `1px solid ${color}28`, background: `${color}0a`, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, color, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color }}>{f.label}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: "#4a6888", lineHeight: 1.6 }}>{f.text}</p>
                  </div>
                  <span style={{ fontSize: 10.5, color: "#3d5570", flexShrink: 0, marginTop: 3, fontWeight: 600 }}>{f.source}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── LLM Recommendation ── */}
        <div style={{ ...s.card, border: "1px solid rgba(96,165,250,0.2)", background: "rgba(37,99,235,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: recoOpen ? 16 : 0 }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: AS }}>LLM Recommendation</p>
              <p style={{ margin: 0, fontSize: 12, color: "#3d5570" }}>Grounded in OP1 → OP2 delta · explainable conclusions</p>
            </div>
            <button onClick={() => setRecoOpen((o) => !o)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(96,165,250,0.2)", background: "transparent", color: AS, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {recoOpen ? "Collapse ↑" : "Expand ↓"}
            </button>
          </div>
          {recoOpen && (
            <div style={{ borderTop: "1px solid rgba(37,99,235,0.12)", paddingTop: 16 }}>
              <div style={{ padding: "0 0 0 14px", borderLeft: "2px solid rgba(96,165,250,0.35)" }}>
                {RECO.map((para, i) => (
                  <p key={i} style={{ margin: i < RECO.length - 1 ? "0 0 12px" : 0, fontSize: 13.5, color: "#7a9ac0", lineHeight: 1.75 }}>{para}</p>
                ))}
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Grounded in simulation data", "OP1→OP2 delta justified", "Risk-adjusted", "Phased rollout suggested"].map((tag) => (
                  <span key={tag} style={s.chip("#60a5fa")}>{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
