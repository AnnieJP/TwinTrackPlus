import { useState, useEffect } from "react";
import DashboardV2 from "./DashboardV2.jsx";

/* ═══════════════════════════════════════════════════════════════════
   TwinTrackV2  —  Revamped UI/UX
   Key changes vs V1:
     • root = height:100vh + overflow:hidden  (kills scroll black-out)
     • sidebar = fixed-height scroll independent of main
     • main content = its own scroll context
     • enrollment form broken into clear sections visible without scrolling
     • routes to DashboardV2 for results
═══════════════════════════════════════════════════════════════════ */

/* ── Data ──────────────────────────────────────────────────────── */
const NAICS_OPTIONS = [
  { value: "722515", label: "Snack & beverage bars" },
  { value: "445291", label: "Bakery / baked goods retail" },
  { value: "448140", label: "Family clothing stores" },
  { value: "812111", label: "Barber / hair / nail services" },
  { value: "722511", label: "Full-service restaurants" },
  { value: "459999", label: "Miscellaneous retail" },
  { value: "541611", label: "Management consulting" },
];

const USE_CASES = [
  { id: "pricing",     label: "Pricing changes",    blurb: "Shift average price or adjust by category.",     icon: "↕" },
  { id: "audience",    label: "Target audience",     blurb: "Shift segments, channels, and marketing mix.",    icon: "◎" },
  { id: "franchising", label: "Franchise expansion", blurb: "Model fees, royalties, and footprint growth.",    icon: "⋈" },
];

const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "");
const TWIN_KEY  = "twintrack_twin_layer_json";
const BIZ_ID_KEY = "twintrack_business_id";
const apiUrl = p => `${API_BASE}${p}`;

function createEnroll() {
  return { businessId:"", businessName:"", naics:NAICS_OPTIONS[0].value, city:"", state:"",
    established:"", monthlyRevenue:"", headcount:"", monthlyRent:"", monthlySupplies:"",
    monthlyUtilities:"", monthlyWageBill:"", loanMonthly:"", cashBalance:"",
    productCategory:"", priceMin:"", priceMax:"", asOfDate: new Date().toISOString().slice(0,10) };
}
function createSim() {
  return { businessId:"", experimentLabel:"", useCase:"pricing", nlDescription:"",
    franchiseFee:"", royaltyPct:"", newLocations:"", timelineMonths:"",
    priceChangePct:"", priceScope:"all", audienceShift:"", marketingBudgetPct:"" };
}

function parseNum(v, def=0) {
  if (v==="" || v==null) return def;
  const n = Number(String(v).replace(/,/g,""));
  return Number.isFinite(n) ? n : def;
}

function buildTwinLayer(e) {
  const naicsLabel = NAICS_OPTIONS.find(o=>o.value===e.naics)?.label ?? "";
  const monthlyRev = parseNum(e.monthlyRevenue);
  const rent = parseNum(e.monthlyRent), sup = parseNum(e.monthlySupplies), util = parseNum(e.monthlyUtilities);
  const wage = parseNum(e.monthlyWageBill), loan = parseNum(e.loanMonthly);
  return {
    meta: { business_id:e.businessId, business_name:e.businessName.trim(), date:e.asOfDate, type:naicsLabel, use_case:null },
    business_profile: { business_type:naicsLabel, location:{ city:e.city.trim(), state:e.state.trim() }, established:e.established||"", business_structure:"" },
    revenue: { total_annual: monthlyRev*12, channels:[{ name:"Primary", percentage:100 }] },
    costs: { monthly_rent:rent, monthly_supplies:sup, monthly_utilities:util, loan:{ original_amount:0, remaining_balance:0, monthly_repayment:loan } },
    staffing: { total_employees:parseNum(e.headcount), monthly_wage_bill:wage },
    products: [{ category:e.productCategory||"", price_range:{ min:parseNum(e.priceMin), max:parseNum(e.priceMax) } }],
    cash: { current_balance:parseNum(e.cashBalance) },
    computed: { cogs_percentage:0, gross_profit:0, net_income:0, break_even_monthly:0, total_operating_expenses:rent+sup+util+wage+loan, prime_cost_ratio:0 },
  };
}

/* ── Tokens ────────────────────────────────────────────────────── */
const C = {
  bg:        "#08090e",
  sidebar:   "#0b0c18",
  surface:   "#0e0f1a",
  border:    "rgba(255,255,255,0.07)",
  accent:    "#6366f1",
  accentSoft:"#a5b4fc",
  accentDim: "rgba(99,102,241,0.15)",
  accentBorder:"rgba(99,102,241,0.35)",
  green:     "#10b981",
  text:      "#e2e8f0",
  textMid:   "#94a3b8",
  textDim:   "#475569",
  red:       "#ef4444",
};

/* ── Shared input style ─────────────────────────────────────────── */
const inp = (err) => ({
  width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)",
  border:`1px solid ${err ? C.red : C.border}`, borderRadius:9, padding:"10px 13px",
  color:C.text, fontSize:13.5, outline:"none", fontFamily:"inherit",
  transition:"border-color 0.15s",
});

/* ── Small components ───────────────────────────────────────────── */
function Label({ children }) {
  return <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:C.textDim, marginBottom:6 }}>{children}</div>;
}
function Field({ label, error, children, half }) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 6px)" : "1 1 100%" }}>
      <Label>{label}</Label>
      {children}
      {error && <div style={{ color:C.red, fontSize:11, marginTop:4 }}>{error}</div>}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>{children}</div>;
}
function Section({ title, children }) {
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:14 }}>
      {title && <div style={{ fontSize:11, fontWeight:700, color:C.accentSoft, letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, paddingBottom:10 }}>{title}</div>}
      {children}
    </div>
  );
}
function PrimaryBtn({ children, onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled||loading} style={{ background:loading||disabled?"rgba(99,102,241,0.4)":C.accent, color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontSize:13.5, fontWeight:600, cursor:disabled||loading?"not-allowed":"pointer", transition:"background 0.15s" }}>
      {loading ? "Running…" : children}
    </button>
  );
}
function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMid, borderRadius:9, padding:"11px 18px", fontSize:13, cursor:"pointer" }}>
      {children}
    </button>
  );
}

function NavItem({ label, active, onClick, dot }) {
  return (
    <button onClick={onClick} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 20px", background:active?"rgba(99,102,241,0.12)":"none", border:"none", borderLeft:`2px solid ${active?C.accent:"transparent"}`, color:active?C.accentSoft:C.textDim, fontSize:13, fontWeight:active?600:400, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:active?C.accent:C.textDim, flexShrink:0 }} />
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main
═══════════════════════════════════════════════════════════════════ */
export default function TwinTrackV2() {
  const [screen, setScreen]         = useState("hub");
  const [simStep, setSimStep]        = useState(1);
  const [enroll, setEnroll]          = useState(createEnroll);
  const [sim, setSim]                = useState(createSim);
  const [errors, setErrors]          = useState({});
  const [enrolling, setEnrolling]    = useState(false);
  const [enrollError, setEnrollError]= useState(null);
  const [enrollDone, setEnrollDone]  = useState(null);   // { bizId, filePath }
  const [simLoading, setSimLoading]  = useState(false);
  const [simError, setSimError]      = useState(null);
  const [result, setResult]          = useState(null);   // { op1, op2, recommendation, bizId, useCase }
  const [enrollments, setEnrollments]= useState([]);

  /* Load enrollments when sim step 1 opens */
  useEffect(() => {
    if (screen !== "simulate") return;
    fetch(apiUrl("/api/enrollments")).then(r=>r.json()).then(d => {
      const list = d.enrollments || d.items || [];
      setEnrollments(Array.isArray(list) ? list : []);
    }).catch(()=>{});
    const stored = sessionStorage.getItem(BIZ_ID_KEY);
    if (stored && !sim.businessId) setSim(s=>({...s, businessId:stored}));
  }, [screen]);

  /* ── Enroll submit ── */
  async function handleEnroll() {
    if (!enroll.businessName.trim()) { setErrors({ businessName:"Required" }); return; }
    if (!enroll.city.trim())         { setErrors({ city:"Required" }); return; }
    setErrors({});
    setEnrolling(true);
    setEnrollError(null);
    try {
      const layer = buildTwinLayer(enroll);
      const res = await fetch(apiUrl("/api/save-twin-layer"), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ twin_layer: layer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const bizId = String(data?.result?.twin_layer?.meta?.business_id || "");
      sessionStorage.setItem(BIZ_ID_KEY, bizId);
      sessionStorage.setItem(TWIN_KEY, JSON.stringify(data?.result?.twin_layer));
      setEnrollDone({ bizId, filePath: data.saved_to });
      setScreen("enroll_done");
    } catch(e) {
      setEnrollError(e.message);
    } finally {
      setEnrolling(false);
    }
  }

  /* ── Sim submit ── */
  async function handleSim() {
    setSimLoading(true);
    setSimError(null);
    try {
      const payload = {
        business_id: sim.businessId,
        sim: {
          useCase: sim.useCase,
          label: sim.experimentLabel || `${sim.useCase} test`,
          nlDescription: sim.nlDescription,
          priceChangePct: sim.useCase==="pricing" ? parseNum(sim.priceChangePct) : undefined,
          priceScope: sim.priceScope,
          marketingBudgetPct: sim.useCase==="audience" ? parseNum(sim.marketingBudgetPct) : undefined,
          audienceShift: sim.audienceShift || undefined,
          franchiseFee: sim.useCase==="franchising" ? parseNum(sim.franchiseFee) : undefined,
          royaltyPct: sim.useCase==="franchising" ? parseNum(sim.royaltyPct) : undefined,
          newLocations: sim.useCase==="franchising" ? parseNum(sim.newLocations) : undefined,
        },
      };
      const res = await fetch(apiUrl("/api/simulate"), {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({
        op1: data.result.op1,
        op2: data.result.op2,
        recommendation: data.result.recommendation || null,
        bizId: sim.businessId,
        useCase: data.result.use_case,
      });
      setScreen("dashboard");
    } catch(e) {
      setSimError(e.message);
    } finally {
      setSimLoading(false);
    }
  }

  /* ── Derive biz/expMeta for dashboard ── */
  const storedTwin = (() => { try { return JSON.parse(sessionStorage.getItem(TWIN_KEY)||"{}"); } catch { return {}; } })();
  const bizMeta = storedTwin?.meta || {};
  const bizProf = storedTwin?.business_profile || {};
  const bizForDash = {
    name: bizMeta.business_name || sim.businessId || "Business",
    type: bizProf.business_type || "",
    location: [bizProf.location?.city, bizProf.location?.state].filter(Boolean).join(", "),
  };
  const expMeta = {
    label: sim.experimentLabel || "",
    useCase: result?.useCase || sim.useCase,
    date: new Date().toISOString().slice(0,10),
  };

  /* ══════════════════════ RENDER ══════════════════════════════════ */

  /* Dashboard screen — full takeover */
  if (screen === "dashboard" && result) {
    return (
      <DashboardV2
        biz={bizForDash}
        expMeta={expMeta}
        op1={result.op1}
        op2={result.op2}
        recommendation={result.recommendation}
        onBack={() => setScreen("hub")}
      />
    );
  }

  /* Shell layout — sidebar + main */
  return (
    <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:C.bg, color:C.text, fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{ width:230, flexShrink:0, height:"100%", background:C.sidebar, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", overflowY:"auto" }}>
        {/* Brand */}
        <div style={{ padding:"24px 20px 20px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.14em", color:C.accentSoft, marginBottom:4, textTransform:"uppercase" }}>WeHack UTD</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#dde8fa", letterSpacing:"-0.03em" }}>TwinTrack</div>
          <div style={{ fontSize:11.5, color:C.textDim, lineHeight:1.6, marginTop:4 }}>Digital twin economic simulator</div>
        </div>

        {/* Nav */}
        <nav style={{ padding:"12px 0", flex:1 }}>
          <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:"0.14em", color:C.textDim, padding:"8px 20px 4px", textTransform:"uppercase" }}>Actions</div>
          {[
            { id:"hub",      label:"Overview" },
            { id:"enroll",   label:"Register business" },
            { id:"simulate", label:"Run simulation" },
          ].map(it => (
            <NavItem key={it.id} label={it.label} active={screen===it.id||screen===it.id+"_done"} onClick={()=>{ setScreen(it.id); setSimStep(1); }} />
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding:"16px 20px", borderTop:`1px solid ${C.border}`, fontSize:10.5, color:C.textDim, lineHeight:1.7 }}>
          Simulation outputs compare OP2 (experiment) vs OP1 (control) baseline.
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main style={{ flex:1, height:"100%", overflowY:"auto" }}>
        {screen==="hub"         && <HubScreen onNav={setScreen} />}
        {screen==="enroll"      && (
          <EnrollScreen enroll={enroll} setEnroll={setEnroll} errors={errors}
            loading={enrolling} error={enrollError}
            onSubmit={handleEnroll} onBack={()=>setScreen("hub")} />
        )}
        {screen==="enroll_done" && enrollDone && (
          <DoneScreen
            title="Business registered"
            sub={`${enroll.businessName || "Business"} · ID ${enrollDone.bizId}`}
            file={enrollDone.filePath}
            primaryLabel="Run a simulation →"
            onPrimary={()=>{ setScreen("simulate"); setSimStep(1); }}
            onBack={()=>setScreen("hub")}
          />
        )}
        {screen==="simulate" && (
          <SimScreen sim={sim} setSim={setSim} simStep={simStep} setSimStep={setSimStep}
            enrollments={enrollments} loading={simLoading} error={simError}
            onRun={handleSim} onBack={()=>setScreen("hub")} />
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Screens
═══════════════════════════════════════════════════════════════════ */

function HubScreen({ onNav }) {
  const cards = [
    { id:"enroll",   icon:"＋", label:"Register business", desc:"Initialize your digital twin with base financial data." },
    { id:"simulate", icon:"▶", label:"Run simulation",    desc:"Model a decision and compare projected outcomes." },
  ];
  return (
    <div style={{ padding:"40px 36px", maxWidth:900 }}>
      <div style={{ marginBottom:36 }}>
        <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:"0.14em", color:"#6366f1", textTransform:"uppercase", marginBottom:8 }}>WeHack UTD · Capital One Track</div>
        <h1 style={{ margin:"0 0 12px", fontSize:32, fontWeight:800, letterSpacing:"-0.03em", color:"#e2e8f0" }}>
          Digital Twin<br/><span style={{ color:"#6366f1" }}>Economic Simulator</span>
        </h1>
        <p style={{ margin:0, fontSize:14.5, color:"#94a3b8", lineHeight:1.7, maxWidth:560 }}>
          Model pricing shifts, franchise expansion, and audience changes against real economic data.
          Compare control vs. experiment outcomes with full explainability.
        </p>
        <div style={{ display:"flex", gap:12, marginTop:20, flexWrap:"wrap" }}>
          {["FRED","BLS","BEA","Census","NewsAPI"].map(t=>(
            <span key={t} style={{ fontSize:11.5, fontWeight:600, padding:"4px 12px", borderRadius:99, background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.25)", color:"#a5b4fc" }}>{t}</span>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", gap:16 }}>
        {cards.map(c=>(
          <button key={c.id} onClick={()=>onNav(c.id)} style={{ flex:1, background:"#0e0f1a", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"28px 24px", textAlign:"left", cursor:"pointer", color:"#e2e8f0", transition:"border-color 0.15s, background 0.15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(99,102,241,0.4)"; e.currentTarget.style.background="#11121f";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"; e.currentTarget.style.background="#0e0f1a";}}>
            <div style={{ width:40, height:40, borderRadius:10, background:"rgba(99,102,241,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, marginBottom:16, color:"#6366f1" }}>{c.icon}</div>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:12.5, color:"#94a3b8", lineHeight:1.6 }}>{c.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop:40, padding:"20px 24px", background:"#0e0f1a", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#6366f1", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>How it works</div>
        <div style={{ display:"flex", gap:0 }}>
          {["Register business →","Run simulation →","View dashboard"].map((s,i)=>(
            <div key={i} style={{ flex:1, fontSize:12.5, color:"#94a3b8" }}>
              <span style={{ color:"#6366f1", fontWeight:700, marginRight:6 }}>{i+1}.</span>{s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Enrollment form ─────────────────────────────────────────────── */
function EnrollScreen({ enroll, setEnroll, errors, loading, error, onSubmit, onBack }) {
  const upd = (k,v) => setEnroll(s=>({...s,[k]:v}));
  return (
    <div style={{ padding:"32px 36px", maxWidth:780 }}>
      <PageHeader title="Register your business" sub="Capture base data to initialize your digital twin" onBack={onBack} />

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Section title="Identity">
          <Row>
            <Field label="Business Name" error={errors.businessName} >
              <input style={inp(errors.businessName)} value={enroll.businessName} onChange={e=>upd("businessName",e.target.value)} placeholder="e.g. Riverside Oven Co." />
            </Field>
            <Field label="Industry (NAICS)" half>
              <select style={{...inp(false), appearance:"none"}} value={enroll.naics} onChange={e=>upd("naics",e.target.value)}>
                {NAICS_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="City" error={errors.city} half>
              <input style={inp(errors.city)} value={enroll.city} onChange={e=>upd("city",e.target.value)} placeholder="Los Angeles" />
            </Field>
            <Field label="State" half>
              <input style={inp(false)} value={enroll.state} onChange={e=>upd("state",e.target.value)} placeholder="CA" />
            </Field>
          </Row>
        </Section>

        <Section title="Financials (monthly)">
          <Row>
            <Field label="Monthly Revenue ($)" half>
              <input type="number" style={inp(false)} value={enroll.monthlyRevenue} onChange={e=>upd("monthlyRevenue",e.target.value)} placeholder="35000" />
            </Field>
            <Field label="Employees" half>
              <input type="number" style={inp(false)} value={enroll.headcount} onChange={e=>upd("headcount",e.target.value)} placeholder="8" />
            </Field>
          </Row>
          <Row>
            <Field label="Rent ($)" half>
              <input type="number" style={inp(false)} value={enroll.monthlyRent} onChange={e=>upd("monthlyRent",e.target.value)} placeholder="3500" />
            </Field>
            <Field label="Wage bill ($)" half>
              <input type="number" style={inp(false)} value={enroll.monthlyWageBill} onChange={e=>upd("monthlyWageBill",e.target.value)} placeholder="12000" />
            </Field>
          </Row>
          <Row>
            <Field label="Supplies ($)" half>
              <input type="number" style={inp(false)} value={enroll.monthlySupplies} onChange={e=>upd("monthlySupplies",e.target.value)} placeholder="4000" />
            </Field>
            <Field label="Utilities ($)" half>
              <input type="number" style={inp(false)} value={enroll.monthlyUtilities} onChange={e=>upd("monthlyUtilities",e.target.value)} placeholder="600" />
            </Field>
          </Row>
        </Section>

        <Section title="Product">
          <Row>
            <Field label="Main product category" half>
              <input style={inp(false)} value={enroll.productCategory} onChange={e=>upd("productCategory",e.target.value)} placeholder="Pastries & coffee" />
            </Field>
            <Field label="Price range — min ($)" half>
              <input type="number" style={inp(false)} value={enroll.priceMin} onChange={e=>upd("priceMin",e.target.value)} placeholder="3" />
            </Field>
          </Row>
          <Row>
            <Field label="Price range — max ($)" half>
              <input type="number" style={inp(false)} value={enroll.priceMax} onChange={e=>upd("priceMax",e.target.value)} placeholder="18" />
            </Field>
            <Field label="Cash balance ($)" half>
              <input type="number" style={inp(false)} value={enroll.cashBalance} onChange={e=>upd("cashBalance",e.target.value)} placeholder="25000" />
            </Field>
          </Row>
        </Section>

        {error && <div style={{ color:C.red, fontSize:12.5, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"10px 14px" }}>{error}</div>}

        <div style={{ display:"flex", gap:10 }}>
          <GhostBtn onClick={onBack}>← Back</GhostBtn>
          <PrimaryBtn onClick={onSubmit} loading={loading}>Register business →</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Simulation form ─────────────────────────────────────────────── */
function SimScreen({ sim, setSim, simStep, setSimStep, enrollments, loading, error, onRun, onBack }) {
  const upd = (k,v) => setSim(s=>({...s,[k]:v}));
  const selectedBiz = enrollments.find(e=>String(e.business_id)===String(sim.businessId));
  const bizLabel = selectedBiz ? `${selectedBiz.business_name} (${selectedBiz.business_id})` : "";

  return (
    <div style={{ padding:"32px 36px", maxWidth:720 }}>
      <PageHeader title="Run a simulation" sub="Model a decision and compare projected outcomes" onBack={onBack} />

      {/* Step indicator */}
      <div style={{ display:"flex", gap:0, marginBottom:28, background:C.surface, borderRadius:10, padding:4, border:`1px solid ${C.border}`, width:"fit-content" }}>
        {["Business","Parameters","Description"].map((label,i)=>(
          <div key={i} style={{ padding:"7px 18px", borderRadius:8, fontSize:12.5, fontWeight:simStep===i+1?600:400, background:simStep===i+1?C.accent:"none", color:simStep===i+1?"#fff":C.textMid, cursor:"pointer", transition:"all 0.15s" }} onClick={()=>simStep>i+1&&setSimStep(i+1)}>
            {i+1}. {label}
          </div>
        ))}
      </div>

      {/* Step 1: Business + use case */}
      {simStep===1 && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Section title="Select business">
            <Field label="Enrolled business">
              <select style={{...inp(false), appearance:"none"}} value={sim.businessId} onChange={e=>upd("businessId",e.target.value)}>
                <option value="">— select —</option>
                {enrollments.map(e=>(
                  <option key={e.business_id} value={e.business_id}>{e.business_name} ({e.business_id}) · {e.date}</option>
                ))}
              </select>
            </Field>
            <Field label="Experiment label (optional)">
              <input style={inp(false)} value={sim.experimentLabel} onChange={e=>upd("experimentLabel",e.target.value)} placeholder="Q3 pricing test" />
            </Field>
          </Section>

          <Section title="Simulation type">
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {USE_CASES.map(uc=>(
                <button key={uc.id} onClick={()=>upd("useCase",uc.id)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:sim.useCase===uc.id?C.accentDim:C.surface, border:`1px solid ${sim.useCase===uc.id?C.accentBorder:C.border}`, borderRadius:10, cursor:"pointer", color:C.text, textAlign:"left", transition:"all 0.15s" }}>
                  <span style={{ fontSize:18, width:28, textAlign:"center" }}>{uc.icon}</span>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:600, color:sim.useCase===uc.id?C.accentSoft:C.text }}>{uc.label}</div>
                    <div style={{ fontSize:11.5, color:C.textMid }}>{uc.blurb}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <div style={{ display:"flex", gap:10 }}>
            <GhostBtn onClick={onBack}>← Back</GhostBtn>
            <PrimaryBtn onClick={()=>setSimStep(2)} disabled={!sim.businessId}>Next →</PrimaryBtn>
          </div>
        </div>
      )}

      {/* Step 2: Parameters */}
      {simStep===2 && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Section title={`${USE_CASES.find(u=>u.id===sim.useCase)?.label || ""} parameters`}>
            {sim.useCase==="pricing" && (
              <Row>
                <Field label="Average price change (%)" half>
                  <input type="number" style={inp(false)} value={sim.priceChangePct} onChange={e=>upd("priceChangePct",e.target.value)} placeholder="+10 or -5" />
                </Field>
                <Field label="Scope" half>
                  <select style={{...inp(false),appearance:"none"}} value={sim.priceScope} onChange={e=>upd("priceScope",e.target.value)}>
                    <option value="all">All SKUs / menu</option>
                    <option value="category">Single category</option>
                  </select>
                </Field>
              </Row>
            )}
            {sim.useCase==="audience" && (
              <Row>
                <Field label="Marketing budget (% of revenue)" half>
                  <input type="number" style={inp(false)} value={sim.marketingBudgetPct} onChange={e=>upd("marketingBudgetPct",e.target.value)} placeholder="8" />
                </Field>
                <Field label="Target segment" half>
                  <select style={{...inp(false),appearance:"none"}} value={sim.audienceShift} onChange={e=>upd("audienceShift",e.target.value)}>
                    <option value="">— same as baseline —</option>
                    <option value="18_34">18–34 (younger)</option>
                    <option value="35_54">35–54 (prime earning)</option>
                    <option value="55_plus">55+ (senior)</option>
                  </select>
                </Field>
              </Row>
            )}
            {sim.useCase==="franchising" && (
              <Row>
                <Field label="Franchise fee ($)" half>
                  <input type="number" style={inp(false)} value={sim.franchiseFee} onChange={e=>upd("franchiseFee",e.target.value)} placeholder="25000" />
                </Field>
                <Field label="Royalty (%)" half>
                  <input type="number" style={inp(false)} value={sim.royaltyPct} onChange={e=>upd("royaltyPct",e.target.value)} placeholder="6" />
                </Field>
                <Field label="New locations" half>
                  <input type="number" style={inp(false)} value={sim.newLocations} onChange={e=>upd("newLocations",e.target.value)} placeholder="3" />
                </Field>
              </Row>
            )}
          </Section>
          <div style={{ display:"flex", gap:10 }}>
            <GhostBtn onClick={()=>setSimStep(1)}>← Back</GhostBtn>
            <PrimaryBtn onClick={()=>setSimStep(3)}>Next →</PrimaryBtn>
          </div>
        </div>
      )}

      {/* Step 3: NL description + run */}
      {simStep===3 && (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Section title="Natural language description (optional)">
            <div style={{ fontSize:12.5, color:C.textMid, lineHeight:1.7 }}>
              Describe the decision in plain English. The LLM layer (Claude Haiku) will extract structured parameters and merge them with the form values above — any specific numbers you mention will override the form.
            </div>
            <textarea
              style={{ ...inp(false), minHeight:100, resize:"vertical", lineHeight:1.6 }}
              value={sim.nlDescription}
              onChange={e=>upd("nlDescription",e.target.value)}
              placeholder="e.g. We want to raise all pastry prices by 15% starting next quarter to cover rising flour costs…"
            />
          </Section>

          {error && <div style={{ color:C.red, fontSize:12.5, background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"10px 14px" }}>{error}</div>}

          <div style={{ display:"flex", gap:10 }}>
            <GhostBtn onClick={()=>setSimStep(2)}>← Back</GhostBtn>
            <PrimaryBtn onClick={onRun} loading={loading}>Run simulation engine →</PrimaryBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Done screen ─────────────────────────────────────────────────── */
function DoneScreen({ title, sub, file, primaryLabel, onPrimary, onBack }) {
  return (
    <div style={{ padding:"32px 36px", maxWidth:640 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"32px 28px", display:"flex", flexDirection:"column", gap:16, alignItems:"flex-start" }}>
        <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, color:C.green }}>✓</div>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:4 }}>{title}</div>
          <div style={{ fontSize:13, color:C.textMid }}>{sub}</div>
        </div>
        {file && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:11.5, fontFamily:"monospace", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", color:C.accentSoft }}>{file}</span>
            <span style={{ fontSize:11.5, background:"rgba(99,102,241,0.12)", border:`1px solid ${C.accentBorder}`, borderRadius:6, padding:"4px 10px", color:C.accentSoft }}>base</span>
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <GhostBtn onClick={onBack}>← Overview</GhostBtn>
          <PrimaryBtn onClick={onPrimary}>{primaryLabel}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Page header ─────────────────────────────────────────────────── */
function PageHeader({ title, sub, onBack }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ fontSize:20, fontWeight:700, color:C.text, marginBottom:4 }}>{title}</div>
      {sub && <div style={{ fontSize:13, color:C.textMid }}>{sub}</div>}
    </div>
  );
}
