import { useState, useEffect } from "react";

/* ─────────────────────────────────────────────────────────────────
   Strategix Dashboard
   Props:
     biz     = { name, type, location }
     expMeta = { label, useCase, date }
     op1     = sim_layer OP1 output
     op2     = sim_layer OP2 output
     onBack  = () => void
   ───────────────────────────────────────────────────────────────── */

/* ── Colour tokens — Midnight & Gold ── */
const C = {
  bg:         "#06101F",
  surface:    "#0D1F3C",
  surfaceUp:  "#152B52",
  border:     "#2A649440",
  accent:     "#2A6496",
  accentSoft: "#D6E8FA",
  gold:       "#C9A227",
  goldLight:  "#F0CE6A",
  text:       "#D6E8FA",
  textDim:    "#6E96C0",
  textMid:    "#6E96C0",
  green:      "#059669",
  red:        "#f87171",
  amber:      "#fbbf24",
};

/* ── Shared styles ── */
const s = {
  root:  { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif", boxSizing:"border-box" },
  inner: { maxWidth:1140, margin:"0 auto", padding:"28px 32px 80px" },
  card:  { background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px" },
  accentCard: { background:"#C9A22710", border:"1px solid #C9A22730", borderRadius:14, padding:"20px 22px" },
  label: { fontSize:10.5, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.textDim, marginBottom:12 },
  chip:  (color) => ({ display:"inline-flex", alignItems:"center", padding:"3px 10px", borderRadius:99, fontSize:11.5, fontWeight:600, letterSpacing:"0.02em", background:color+"22", border:`1px solid ${color}44`, color }),
  deltaUp:   { color:C.green, fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(52,211,153,0.1)", border:"1px solid rgba(52,211,153,0.2)" },
  deltaDown: { color:C.red,   fontSize:12, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.2)" },
};

/* ── Helpers ── */
const fmt$  = (v) => "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits:0 });
const fmtN  = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits:0 });
const fmtPct= (v) => (v * 100).toFixed(1) + "%";
const fmtDelta = (v, prefix="$") => {
  const pos = v >= 0;
  let valStr;
  if (prefix === "$")       valStr = fmt$(Math.abs(v));
  else if (prefix === "pp") valStr = Math.abs(v).toFixed(1) + "pp";
  else                      valStr = fmtN(Math.abs(v));   // visits / raw integer
  return <span style={pos ? s.deltaUp : s.deltaDown}>{pos ? "+" : "−"}{valStr}{pos ? " ↑" : " ↓"}</span>;
};

/* ── Summary builder for clipboard / PDF ── */
function buildSummary({ biz, expMeta, f1, f2, d, confidence, flags, recommendation }) {
  const hr  = "─".repeat(44);
  const col = (str, w) => String(str).padEnd(w);

  const metrics = [
    ["Monthly Revenue", fmt$(f1.revenue||0),    fmt$(f2.revenue||0),    (d.revenue_delta>=0?"+":"")+fmt$(d.revenue_delta||0)],
    ["Gross Margin",    fmtPct(f1.margin||0),   fmtPct(f2.margin||0),   (d.margin_delta>=0?"+":"")+((d.margin_delta||0)*100).toFixed(1)+"pp"],
    ["Monthly Profit",  fmt$(f1.profit||0),     fmt$(f2.profit||0),     (d.profit_delta>=0?"+":"")+fmt$(d.profit_delta||0)],
    ["Foot Traffic",    fmtN(f1.footfall||0),   fmtN(f2.footfall||0),   ""],
    ["Avg Ticket",      fmt$(f1.avg_ticket||0), fmt$(f2.avg_ticket||0), ""],
    ["COGS",            fmt$(f1.cogs||0),       fmt$(f2.cogs||0),       ""],
  ];
  const tableHeader = `  ${col("Metric",18)}  ${col("Control",13)}  ${col("Experiment",13)}  Delta`;
  const tableRows   = metrics.map(([l,c,e,dv]) => `  ${col(l,18)}  ${col(c,13)}  ${col(e,13)}  ${dv}`).join("\n");

  const netDelta    = d.profit_delta || 0;
  const netDeltaPct = f1.profit ? ((netDelta / f1.profit) * 100).toFixed(1) : "0";
  const netSign     = netDelta >= 0 ? "+" : "";

  const marginPp   = ((d.margin_delta||0)*100).toFixed(1);
  const marginDir  = (d.margin_delta||0) >= 0 ? "expanding" : "declining";
  const recoText = recommendation
    || (d.revenue_delta >= 0
      ? `The simulation projects a revenue improvement of ${fmt$(d.revenue_delta)}/mo (+${((d.revenue_delta/(f1.revenue||1))*100).toFixed(1)}%) with margin ${marginDir} by ${Math.abs(Number(marginPp)).toFixed(1)}pp. Confidence: ${Math.round(confidence*100)}%.`
      : `The simulation projects a revenue decline of ${fmt$(Math.abs(d.revenue_delta||0))}/mo with margin ${marginDir} by ${Math.abs(Number(marginPp)).toFixed(1)}pp. Review cost structure before proceeding. Confidence: ${Math.round(confidence*100)}%.`);

  const flagLines = (flags||[]).length
    ? (flags.map(f => `  [${(f.impact||"neutral").toUpperCase()}] ${f.headline} — ${f.relevance}`).join("\n"))
    : "  None";

  const breakEven = f2.break_even_months ? `\nBreak-even:        ${f2.break_even_months.toFixed(1)} months` : "";

  return [
    "Strategix — Simulation Results",
    hr,
    `Business:    ${biz?.name || "—"}`,
    `Type:        ${biz?.type || "—"}`,
    `Location:    ${biz?.location || "—"}`,
    `Experiment:  ${expMeta?.label || "—"} (${expMeta?.useCase || "—"})`,
    `Date:        ${expMeta?.date || new Date().toLocaleDateString()}`,
    "",
    "KEY METRICS",
    hr,
    tableHeader,
    tableRows,
    "",
    `Net Income Delta:  ${netSign}${fmt$(netDelta)}/mo  (${netSign}${netDeltaPct}% vs. baseline)${breakEven}`,
    `Confidence Score:  ${Math.round(confidence*100)}%`,
    "",
    "RISK FLAGS",
    hr,
    flagLines,
    "",
    "RECOMMENDATION",
    hr,
    recoText,
    "",
    `Generated by Strategix · ${new Date().toLocaleString()}`,
  ].join("\n");
}

/* ── Sentiment Bar ── */
function SentimentBar({ score }) {
  const pct = ((score + 1) / 2) * 100;
  const color = score < -0.2 ? C.red : score < 0.2 ? C.amber : C.green;
  const label = score < -0.2 ? "Slightly Negative" : score < 0.2 ? "Neutral" : "Positive";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ flex:1, height:6, borderRadius:99, background:C.surfaceUp, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.red},${color === C.green ? "#059669" : color})`, borderRadius:99, transition:"width 0.6s ease" }} />
      </div>
      <span style={{ fontSize:12.5, fontWeight:700, color, flexShrink:0 }}>{score.toFixed(2)} — {label}</span>
    </div>
  );
}

/* ── Confidence Ring ── */
function ConfidenceRing({ score }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 70 ? C.green : pct >= 45 ? C.amber : C.red;
  const r = 28, circ = 2 * Math.PI * r;
  const dash = circ * (1 - score);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
      <svg width={72} height={72} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="none" stroke={C.surfaceUp} strokeWidth={6} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={dash} strokeLinecap="round"
          style={{ transition:"stroke-dashoffset 1s ease" }} />
      </svg>
      <div>
        <p style={{ margin:0, fontSize:26, fontWeight:800, color, letterSpacing:"-0.04em" }}>{pct}%</p>
        <p style={{ margin:0, fontSize:11, color:C.textMid, fontWeight:600 }}>Confidence Score</p>
      </div>
    </div>
  );
}

/* ── Line Chart ── */
function LineChart({ proj_op1, proj_op2, currentRevenue = 0 }) {
  const W=620, H=180, padL=56, padR=20, padT=16, padB=32;
  const iW = W - padL - padR, iH = H - padT - padB;

  // Prepend month 0 (current state) as shared anchor — both lines start here
  const anchor = { month: 0, value: currentRevenue, date: "Now" };
  const op1 = [anchor, ...proj_op1];
  const op2 = [anchor, ...proj_op2];

  const allMonths = [...new Set([
    ...op1.map(p => p.month),
    ...op2.map(p => p.month),
  ])].sort((a, b) => a - b);

  const allVals = [...op1.map(p => p.value), ...op2.map(p => p.value)];
  if (allVals.length === 0) return null;

  const dataMin = Math.min(...allVals) * 0.98;  // 2% breathing room below
  const dataMax = Math.max(...allVals) * 1.02;  // 2% breathing room above
  const range   = dataMax - dataMin || 1;
  const n       = allMonths.length;

  const toX = (i) => padL + (n === 1 ? iW / 2 : (i / (n - 1)) * iW);
  const toY = (v)  => padT + iH - ((v - dataMin) / range) * iH;

  const points = (series) =>
    series.map((p) => {
      const idx = allMonths.indexOf(p.month);
      return [toX(idx), toY(p.value)];
    });

  const toPolyline = (pts) => pts.map(([x, y]) => `${x},${y}`).join(" ");

  const toAreaPath = (pts, baseline) => {
    if (pts.length === 0) return "";
    const top  = `M${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map(([x,y]) => `L${x},${y}`).join(" ");
    const bot  = `L${pts[pts.length-1][0]},${baseline} L${pts[0][0]},${baseline} Z`;
    return top + " " + bot;
  };

  const pts1 = points(op1);
  const pts2 = points(op2);
  const baseline = toY(dataMin);

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => dataMin + (range * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:"block" }}>
      <defs>
        <linearGradient id="op1fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(100,130,170,0.18)" />
          <stop offset="100%" stopColor="rgba(100,130,170,0)"    />
        </linearGradient>
        <linearGradient id="op2fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(42,100,150,0.22)" />
          <stop offset="100%" stopColor="rgba(42,100,150,0)"    />
        </linearGradient>
      </defs>

      {/* Grid lines + Y-axis labels */}
      {tickVals.map((v) => (
        <g key={v}>
          <line x1={padL} y1={toY(v)} x2={W-padR} y2={toY(v)}
            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          <text x={padL-8} y={toY(v)+4} textAnchor="end"
            fill={C.textDim} fontSize={8.5}>{fmt$(v)}</text>
        </g>
      ))}

      {/* Area fills */}
      {pts1.length > 1 && <path d={toAreaPath(pts1, baseline)} fill="url(#op1fill)" />}
      {pts2.length > 1 && <path d={toAreaPath(pts2, baseline)} fill="url(#op2fill)" />}

      {/* Lines */}
      {pts1.length > 1 && (
        <polyline points={toPolyline(pts1)}
          fill="none" stroke="rgba(100,130,170,0.6)" strokeWidth={2} strokeLinejoin="round" />
      )}
      {pts2.length > 1 && (
        <polyline points={toPolyline(pts2)}
          fill="none" stroke="rgba(42,100,150,0.9)" strokeWidth={2} strokeLinejoin="round" />
      )}

      {/* Dots + X-axis labels */}
      {allMonths.map((month, i) => {
        const p1 = op1.find(p => p.month === month);
        const p2 = op2.find(p => p.month === month);
        const lbl    = month === 0 ? "Now" : ((p1 || p2)?.date || `Mo ${month}`);
        const isNow  = month === 0;
        return (
          <g key={month}>
            {isNow
              /* Shared anchor dot — single filled circle, no duplication */
              ? <circle cx={toX(i)} cy={toY(p1.value)} r={4.5}
                  fill="rgba(255,255,255,0.55)" stroke="none" />
              : <>
                  {p1 && <circle cx={toX(i)} cy={toY(p1.value)} r={3.5}
                    fill={C.bg} stroke="rgba(100,130,170,0.7)" strokeWidth={2} />}
                  {p2 && <circle cx={toX(i)} cy={toY(p2.value)} r={3.5}
                    fill={C.bg} stroke="#2A6496" strokeWidth={2} />}
                </>
            }
            <text x={toX(i)} y={H-8} textAnchor="middle"
              fill={isNow ? C.text : C.textDim} fontSize={isNow ? 9 : 8.5}
              fontWeight={isNow ? 700 : 400}>{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Verdict Banner ── */
function VerdictBanner({ recommendation }) {
  if (!recommendation) return null;
  let verdict, color, bg, icon;
  if (recommendation.startsWith("DO NOT PROCEED")) {
    verdict = "DO NOT PROCEED"; color = C.red;
    bg = "rgba(248,113,113,0.08)"; icon = "⛔";
  } else if (recommendation.startsWith("PROCEED WITH CAUTION")) {
    verdict = "PROCEED WITH CAUTION"; color = C.amber;
    bg = "rgba(251,191,36,0.08)"; icon = "⚠️";
  } else if (recommendation.startsWith("PROCEED")) {
    verdict = "PROCEED"; color = C.green;
    bg = "rgba(5,150,105,0.1)"; icon = "✓";
  } else {
    return null;
  }
  const rest = recommendation.slice(verdict.length).replace(/^[:\s—\-]+/, "").trim();
  return (
    <div style={{ background: bg, border: `1px solid ${color}44`, borderRadius: 14, padding: "18px 24px", marginBottom: 28, display: "flex", alignItems: "flex-start", gap: 16 }}>
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin:"0 0 4px", fontSize:10.5, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.gold }}>AI Verdict</p>
        <p style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{verdict}</p>
        {rest && <p style={{ margin: 0, fontSize: 13, color: C.textMid, lineHeight: 1.65 }}>{rest}</p>}
      </div>
    </div>
  );
}

/* ── Pipeline Breadcrumb ── */
function PipelineBreadcrumb({ agentLog }) {
  const steps = [
    { key: "fetch",      label: "5 Live APIs",     always: true },
    { key: "arima",      label: "ARIMA Forecast",  always: true },
    { key: "enrichment", label: "Enrichment",      agent: "enrichment_agent" },
    { key: "simulation", label: "Simulation",      agent: "simulation_engine" },
    { key: "critique",   label: "Critique",        agent: "critique_agent" },
    { key: "asp",        label: "ASP Rules Engine", agent: "decision_engine" },
    { key: "prose",      label: "LLM Prose",       agent: "simulation_agent" },
  ];
  const ran = new Set((agentLog || []).map(e => e.agent));
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0, marginBottom: 28 }}>
      {steps.map((step, i) => {
        const active = step.always || ran.has(step.agent);
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <span style={{ color: C.textDim, fontSize: 10, margin: "0 6px" }}>→</span>}
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
              background: active ? "#C9A22712" : C.surface,
              border: active ? "1px solid #C9A22740" : `1px solid ${C.border}`,
              color: active ? C.gold : C.textDim,
              letterSpacing: "0.04em",
            }}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Critique Panel ── */
function CritiquePanel({ agentLog, flags }) {
  const critiqueEntry = (agentLog || []).find(e => e.agent === "critique_agent" && e.action === "critiqued");
  const adjustEntry   = (agentLog || []).find(e => e.agent === "critique_agent" && e.action === "confidence_adjusted");
  if (!critiqueEntry) return null;

  const nFindings    = critiqueEntry.adjustments?.findings_count ?? 0;
  const penalty      = critiqueEntry.adjustments?.penalty_applied;
  const adjBefore    = adjustEntry?.adjustments?.confidence_score?.before;
  const adjAfter     = adjustEntry?.adjustments?.confidence_score?.after;
  const critiqueVerdict = critiqueEntry.notes?.slice(critiqueEntry.notes.indexOf(". ") + 2) || "";
  const agentFlags   = (flags || []).filter(f => f.source === "critique" || !f.source);

  const headerColor  = nFindings === 0 ? C.green : penalty ? C.red : C.amber;

  return (
    <div style={{ background: C.surface, border: `1px solid ${headerColor}33`, borderRadius: 14, padding: "20px 22px", marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.textDim }}>Critique Agent</p>
          <p style={{ margin: 0, fontSize: 12, color: C.textMid }}>Reviewed projection vs. market context</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: `${headerColor}18`, border: `1px solid ${headerColor}44`, color: headerColor }}>
            {nFindings === 0 ? "No contradictions" : `${nFindings} contradiction${nFindings > 1 ? "s" : ""} found`}
          </span>
          {penalty != null && (
            <span style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: C.red }}>
              Confidence −{(penalty * 100).toFixed(0)}pp
            </span>
          )}
          {adjBefore != null && adjAfter != null && (
            <span style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, background: C.surfaceUp, border: `1px solid ${C.border}`, color: C.textMid }}>
              {(adjBefore * 100).toFixed(0)}% → {(adjAfter * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
      {agentFlags.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: critiqueVerdict ? 14 : 0 }}>
          {agentFlags.slice(0, 3).map((f, i) => {
            const impact = f.impact || "neutral";
            const fc = impact === "negative" ? C.red : impact === "positive" ? C.green : C.amber;
            return (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: 9, background: `${fc}08`, border: `1px solid ${fc}22` }}>
                <span style={{ fontSize: 11, color: fc, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{impact.toUpperCase()}</span>
                <p style={{ margin: 0, fontSize: 12, color: C.textMid, lineHeight: 1.55 }}>{f.headline} — {f.relevance}</p>
              </div>
            );
          })}
        </div>
      )}
      {critiqueVerdict && (
        <p style={{ margin: 0, fontSize: 12, color: C.textDim, fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          Agent verdict: “{critiqueVerdict}”
        </p>
      )}
    </div>
  );
}

/* ── Credit Risk Card ── */
function CreditRiskCard({ creditRisk }) {
  if (!creditRisk) return null;
  const sigColor = {
    creditworthy:  C.green,
    elevated_risk: C.amber,
    high_risk:     C.red,
  }[creditRisk.signal] || C.textDim;
  const sigDot = {
    creditworthy:  "●",
    elevated_risk: "◆",
    high_risk:     "▲",
  }[creditRisk.signal] || "●";
  return (
    <div style={{ background: sigColor + "0d", border: `1px solid ${sigColor}33`, borderRadius:14, padding:"20px 22px" }}>
      <p style={{ margin:"0 0 10px", fontSize:10.5, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.textDim }}>Credit Risk Signal</p>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <span style={{ fontSize:18, color:sigColor }}>{sigDot}</span>
        <span style={{ fontSize:20, fontWeight:800, color:sigColor, letterSpacing:"-0.02em" }}>{creditRisk.label}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {(creditRisk.reasons || []).map((r, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:10, color:sigColor, marginTop:2, flexShrink:0 }}>—</span>
            <p style={{ margin:0, fontSize:12, color:C.textMid, lineHeight:1.55 }}>{r}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function Dashboard({ biz, expMeta, op1, op2, recommendation, agentLog, onBack }) {
  const [visible,  setVisible]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

  /* Pull data from OP files */
  const f1   = op1?.financials   || {};
  const f2   = op2?.financials   || {};
  const d    = op2?.delta        || {};
  const risk = op2?.risk         || {};
  const expl = op2?.explanations || {};
  const proj1 = op1?.projections?.revenue_6m || [];
  const proj2 = op2?.projections?.revenue_6m || [];
  const flags = risk.flags || [];
  const sentiment = risk.sentiment_score ?? 0;
  const confidence = risk.confidence_score ?? 0;
  const creditRisk = op2?.credit_risk || null;

  /* Net income delta */
  const netDelta = d.profit_delta || 0;
  const netDeltaPct = f1.profit ? ((netDelta / f1.profit) * 100).toFixed(1) : "0";
  const marginPp  = ((d.margin_delta||0)*100).toFixed(1);
  const marginDir = (d.margin_delta||0) >= 0 ? "expanding" : "declining";

  const fade = { opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: "opacity 0.5s ease, transform 0.5s ease" };

  return (
    <>
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
    <div style={s.root}>
      <div style={s.inner}>

        {/* Verdict Banner */}
        <div style={fade}>
          <VerdictBanner recommendation={recommendation} />
        </div>

        {/* Top bar — back + export actions */}
        <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
          <button onClick={onBack} style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.textMid, fontSize:12.5, cursor:"pointer", fontFamily:"inherit" }}>
            ← Back to overview
          </button>
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={() => {
                const text = buildSummary({ biz, expMeta, f1, f2, d, confidence, flags, recommendation });
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background: copied ? "rgba(5,150,105,0.15)" : "transparent", color: copied ? C.green : C.textMid, fontSize:12.5, cursor:"pointer", fontFamily:"inherit", transition:"color 0.2s, background 0.2s" }}
            >
              {copied ? "✓ Copied" : "Copy Summary"}
            </button>
            <button
              onClick={() => window.print()}
              style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:`1px solid ${C.border}`, background:C.surfaceUp, color:C.text, fontSize:12.5, cursor:"pointer", fontFamily:"inherit" }}
            >
              Save as PDF
            </button>
          </div>
        </div>

        {/* Header */}
        <div style={{ ...fade, marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <p style={{ fontSize:10.5, fontWeight:700, letterSpacing:"0.16em", textTransform:"uppercase", color:C.textDim, margin:"0 0 6px" }}>Simulation Results</p>
              <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.04em", color:C.text, margin:"0 0 8px", lineHeight:1.15 }}>{biz?.name || "Business"}</h1>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {expMeta?.label && expMeta.label !== expMeta?.useCase && (
                  <span style={s.chip(C.gold)}>{expMeta.label}</span>
                )}
                <span style={s.chip(C.accent)}>{expMeta?.useCase || "Use Case"}</span>
                <span style={s.chip(C.accent)}>{biz?.location || "Location"}</span>
                <span style={s.chip(C.textDim)}>{expMeta?.date || new Date().toLocaleDateString()}</span>
              </div>
            </div>
            <div style={{ ...s.card, textAlign:"right", minWidth:200 }}>
              <p style={{ margin:"0 0 2px", fontSize:10.5, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", color:C.textDim }}>News Sentiment</p>
              <p style={{ margin:"0 0 10px", fontSize:11, color:C.textMid }}>{biz?.location} · {biz?.type}</p>
              <SentimentBar score={sentiment} />
            </div>
          </div>
        </div>

        {/* Pipeline Breadcrumb */}
        <div style={{ ...fade, transitionDelay:"0.04s" }}>
          <PipelineBreadcrumb agentLog={agentLog} />
        </div>

        {/* KPI Grid */}
        <div style={{ ...fade, marginBottom:28, transitionDelay:"0.05s" }}>
          <p style={s.label}>Key Metrics — Control vs. Experiment</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {[
              { label:"Monthly Revenue", ctrl:fmt$(f1.revenue),       expt:fmt$(f2.revenue),       delta:fmtDelta(d.revenue_delta),             highlight:true,  explain:expl.revenue  },
              { label:"Gross Margin",    ctrl:fmtPct(f1.margin||0),   expt:fmtPct(f2.margin||0),   delta:fmtDelta((d.margin_delta||0)*100,"pp"), highlight:true,  explain:expl.margin   },
              { label:"Foot Traffic",    ctrl:fmtN(f1.footfall||0),   expt:fmtN(f2.footfall||0),   delta:fmtDelta((f2.footfall||0)-(f1.footfall||0),"#"), highlight:false, explain:expl.footfall },
              { label:"Avg Transaction", ctrl:fmt$(f1.avg_ticket||0), expt:fmt$(f2.avg_ticket||0), delta:fmtDelta((f2.avg_ticket||0)-(f1.avg_ticket||0)), highlight:false, explain:expl.avg_ticket },
            ].map((k) => (
              <div key={k.label} style={{ background: k.highlight ? C.surfaceUp : C.surface, border: k.highlight ? `1px solid ${C.accent}55` : `1px solid ${C.border}`, borderRadius:14, padding:"18px 20px" }}>
                <p style={{ margin:"0 0 12px", fontSize:11.5, fontWeight:600, color:C.textDim, letterSpacing:"0.03em", textTransform:"uppercase" }}>{k.label}</p>
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:C.textDim, textDecoration:"line-through", textDecorationColor:`${C.textDim}55` }}>{k.ctrl}</span>
                  <span style={{ fontSize:16, color:C.textDim, margin:"0 2px" }}>→</span>
                  <span style={{ fontSize:20, fontWeight:800, color:C.text, letterSpacing:"-0.02em" }}>{k.expt}</span>
                </div>
                {k.delta}
                {k.explain && (
                  <p style={{ margin:"8px 0 0", fontSize:10.5, color:C.textDim, fontStyle:"italic", lineHeight:1.6 }}>{k.explain}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Net Income + Confidence */}
        <div style={{ ...fade, display:"grid", gridTemplateColumns:"1fr auto", gap:14, marginBottom:28, transitionDelay:"0.1s" }}>
          <div style={{ ...s.accentCard, display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(15,58,46,0.4)", border:"1px solid rgba(5,150,105,0.3)" }}>
            <div>
              <p style={{ margin:"0 0 3px", fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textDim }}>Projected Net Income Delta</p>
              <p style={{ margin:0, fontSize:13, color:C.textMid }}>Monthly · post experiment implementation</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ margin:"0 0 4px", fontSize:28, fontWeight:800, color: netDelta >= 0 ? C.green : C.red, letterSpacing:"-0.04em" }}>
                {netDelta >= 0 ? "+" : ""}{fmt$(netDelta)} / mo
              </p>
              <span style={netDelta >= 0 ? s.deltaUp : s.deltaDown}>{netDelta >= 0 ? "+" : ""}{netDeltaPct}% vs. control baseline</span>
            </div>
          </div>
          <div style={{ ...s.card, display:"flex", alignItems:"center", padding:"20px 28px" }}>
            <ConfidenceRing score={confidence} />
          </div>
        </div>

        {/* Critique Agent Panel */}
        <div style={{ ...fade, transitionDelay:"0.11s" }}>
          <CritiquePanel agentLog={agentLog} flags={flags} />
        </div>

        {/* Lender View — Credit Risk Signal */}
        {creditRisk && (
          <div style={{ ...fade, marginBottom:28, transitionDelay:"0.12s" }}>
            <p style={s.label}>Lender View</p>
            <CreditRiskCard creditRisk={creditRisk} />
          </div>
        )}

        {/* Revenue Projection Chart */}
        {proj1.length > 0 && (
          <div style={{ ...fade, ...s.card, marginBottom:28, transitionDelay:"0.15s" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <p style={{ ...s.label, margin:0 }}>{Math.max(proj1.length, proj2.length)}-Month Revenue Projection</p>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <svg width={24} height={10} style={{ flexShrink:0 }}>
                    <line x1={0} y1={5} x2={24} y2={5} stroke="rgba(100,130,170,0.6)" strokeWidth={2} />
                    <circle cx={12} cy={5} r={3} fill={C.bg} stroke="rgba(100,130,170,0.7)" strokeWidth={2} />
                  </svg>
                  <span style={{ fontSize:11, color:C.textDim, fontWeight:600 }}>Control</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <svg width={24} height={10} style={{ flexShrink:0 }}>
                    <line x1={0} y1={5} x2={24} y2={5} stroke="rgba(42,100,150,0.9)" strokeWidth={2} />
                    <circle cx={12} cy={5} r={3} fill={C.bg} stroke="#2A6496" strokeWidth={2} />
                  </svg>
                  <span style={{ fontSize:11, color:C.text, fontWeight:600 }}>Experiment</span>
                </div>
              </div>
            </div>
            <LineChart proj_op1={proj1} proj_op2={proj2} currentRevenue={f1.revenue || 0} />
          </div>
        )}

        {/* OP1 / OP2 Full Comparison */}
        <div style={{ ...fade, marginBottom:28, transitionDelay:"0.2s" }}>
          <p style={s.label}>Full Output Comparison</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {/* OP1 */}
            <div style={s.card}>
              <p style={{ margin:"0 0 4px", fontSize:11, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.textDim }}>Control Baseline</p>
              <p style={{ margin:"0 0 16px", fontSize:12, color:C.textMid }}>Current state · no change applied</p>
              {[
                ["Monthly Revenue",    fmt$(f1.revenue||0)],
                ["Gross Margin",       fmtPct(f1.margin||0)],
                ["Monthly Profit",     fmt$(f1.profit||0)],
                ["Foot Traffic",       fmtN(f1.footfall||0) + " visits"],
                ["Avg Ticket",         fmt$(f1.avg_ticket||0)],
                ["COGS",               fmt$(f1.cogs||0)],
              ].map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12.5, color:C.textDim }}>{k}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:C.textMid }}>{v}</span>
                </div>
              ))}
            </div>
            {/* OP2 */}
            <div style={s.accentCard}>
              <p style={{ margin:"0 0 4px", fontSize:11, fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.gold }}>Experiment Results</p>
              <p style={{ margin:"0 0 16px", fontSize:12, color:C.textMid }}>Post-decision projection · {expMeta?.label}</p>
              {[
                ["Monthly Revenue",  fmt$(f2.revenue||0),              (f2.revenue||0)   >= (f1.revenue||0),  expl.revenue   ],
                ["Gross Margin",     fmtPct(f2.margin||0),             (f2.margin||0)    >= (f1.margin||0),   expl.margin    ],
                ["Monthly Profit",   fmt$(f2.profit||0),               (f2.profit||0)    >= (f1.profit||0),   null           ],
                ["Foot Traffic",     fmtN(f2.footfall||0) + " visits", (f2.footfall||0)  >= (f1.footfall||0), expl.footfall  ],
                ["Avg Ticket",       fmt$(f2.avg_ticket||0),           (f2.avg_ticket||0)>= (f1.avg_ticket||0),expl.avg_ticket],
                ["COGS",             fmt$(f2.cogs||0),                 (f2.cogs||0)      <= (f1.cogs||0),     expl.cogs      ],
              ].map(([k, v, isGood, hint]) => (
                <div key={k} style={{ padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:12.5, color:C.textMid }}>{k}</span>
                    <span style={{ fontSize:13, fontWeight:700, color: isGood ? C.green : C.red }}>{v}</span>
                  </div>
                  {hint && <p style={{ margin:"3px 0 0", fontSize:10.5, color:C.textDim, fontStyle:"italic", lineHeight:1.5 }}>{hint}</p>}
                </div>
              ))}
              {f2.break_even_months && (
                <div style={{ display:"flex", justifyContent:"space-between", padding:"9px 0" }}>
                  <span style={{ fontSize:12.5, color:C.textMid }}>Break-even</span>
                  <span style={{ fontSize:13, fontWeight:700, color: f2.break_even_months < 24 ? C.green : C.amber }}>{f2.break_even_months.toFixed(1)} months</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Watch Out Flags */}
        {flags.length > 0 && (
          <div style={{ ...fade, marginBottom:28, transitionDelay:"0.25s" }}>
            <p style={s.label}>Watch Out Flags — News-Driven Risk</p>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[...flags].sort((a, b) => {
                const order = { positive: 0, negative: 1, neutral: 2 };
                return (order[a.impact] ?? 2) - (order[b.impact] ?? 2);
              }).map((f, i) => {
                const impact = f.impact || "neutral";
                const color  = impact === "negative" ? C.red : impact === "positive" ? C.green : C.amber;
                const icon   = impact === "negative" ? "▲" : impact === "positive" ? "▼" : "●";
                return (
                  <div key={i} style={{ display:"flex", gap:14, padding:"14px 18px", borderRadius:12, border:`1px solid ${color}28`, background:`${color}0a`, alignItems:"flex-start" }}>
                    <span style={{ fontSize:13, color, flexShrink:0, marginTop:1 }}>{icon}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:"0 0 3px", fontSize:13, fontWeight:700, color }}>{f.headline}</p>
                      <p style={{ margin:0, fontSize:12.5, color:C.textMid, lineHeight:1.6 }}>{f.relevance}</p>
                    </div>
                    <span style={{ fontSize:10.5, color:C.textDim, flexShrink:0, marginTop:3, fontWeight:600 }}>{f.impact?.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}


      </div>
    </div>
    </>
  );
}
