import { useState } from "react";

const wines = [
  { name: "Château Margaux 2018", region: "Bordeaux, France", type: "red", taste: ["dry", "bold", "earthy"], price: 185, desc: "Deep cassis and violets with a silken tannic structure. Exceptional for a special occasion.", tags: ["bold", "cellar-worthy", "classic"], badge: "🍷", pairing: "Roast lamb, aged cheese" },
  { name: "Barolo Serralunga", region: "Piedmont, Italy", type: "red", taste: ["dry", "bold", "earthy"], price: 65, desc: "Tar, roses and wild cherry with pronounced tannins that beg for food.", tags: ["bold", "earthy", "food-friendly"], badge: "🍷", pairing: "Truffle pasta, braised beef" },
  { name: "Pinot Noir, La Crema", region: "Sonoma Coast, California", type: "red", taste: ["fruity", "light", "dry"], price: 38, desc: "Bright cranberry and pomegranate with silky tannins and a cool-climate finish.", tags: ["light", "fruity", "versatile"], badge: "🍷", pairing: "Salmon, duck, mushrooms" },
  { name: "Penfolds Grange 2017", region: "South Australia", type: "red", taste: ["bold", "dry", "oaky"], price: 155, desc: "Australia's most iconic Shiraz. Opulent black fruit, dark chocolate and cedar spice.", tags: ["bold", "iconic", "oaky"], badge: "🍷", pairing: "Aged cheddar, beef short ribs" },
  { name: "Sancerre Blanc, Henri Bourgeois", region: "Loire Valley, France", type: "white", taste: ["dry", "light", "fruity"], price: 42, desc: "Citrus zest, white flowers and flinty minerality. The benchmark Sauvignon Blanc.", tags: ["crisp", "mineral", "classic"], badge: "🥂", pairing: "Goat cheese, oysters, sole" },
  { name: "Chablis Premier Cru", region: "Burgundy, France", type: "white", taste: ["dry", "light", "earthy"], price: 55, desc: "Pure, cool and stony. Green apple, lemon curd and a long mineral finish.", tags: ["mineral", "refined", "dry"], badge: "🥂", pairing: "Shellfish, white fish, sushi" },
  { name: "Grüner Veltliner Smaragd", region: "Wachau, Austria", type: "white", taste: ["dry", "light", "fruity"], price: 45, desc: "Peppery herbs, grapefruit and a sleek, textured palate. A wine lover's white.", tags: ["peppery", "unique", "food-friendly"], badge: "🥂", pairing: "Asparagus, schnitzel, fish" },
  { name: "Albariño, Pazo Señorans", region: "Rías Baixas, Spain", type: "white", taste: ["fruity", "light", "dry"], price: 28, desc: "Peach, apricot and saline freshness. Coastal vibes in a glass.", tags: ["fresh", "fruity", "seaside"], badge: "🥂", pairing: "Seafood, tapas, sushi" },
  { name: "Riesling Spätlese, Dr. Loosen", region: "Mosel, Germany", type: "white", taste: ["sweet", "fruity", "floral"], price: 32, desc: "Peach, honey and electric acidity that makes this sweet wine feel weightless.", tags: ["sweet", "floral", "elegant"], badge: "🥂", pairing: "Spicy cuisine, pork, fruit tarts" },
  { name: "Château d'Esclans Whispering Angel", region: "Provence, France", type: "rosé", taste: ["dry", "fruity", "light", "floral"], price: 30, desc: "The world's most beloved rosé. Pale salmon, strawberry and fresh herbs.", tags: ["classic", "chic", "summer"], badge: "🌸", pairing: "Salads, grilled fish, charcuterie" },
  { name: "Miraval Rosé, Famille Perrin", region: "Provence, France", type: "rosé", taste: ["dry", "fruity", "floral"], price: 25, desc: "Pale gold with peach blossom, grapefruit and a creamy mid-palate.", tags: ["elegant", "Provence", "dry"], badge: "🌸", pairing: "Mediterranean dishes, light pasta" },
  { name: "Dom Pérignon 2013", region: "Champagne, France", type: "sparkling", taste: ["dry", "fruity", "oaky"], price: 195, desc: "The pinnacle of Champagne. Toasted brioche, candied lemon and endless effervescence.", tags: ["iconic", "celebration", "luxury"], badge: "✨", pairing: "Oysters, caviar, lobster" },
  { name: "Veuve Clicquot Yellow Label", region: "Champagne, France", type: "sparkling", taste: ["dry", "fruity", "light"], price: 60, desc: "Reliable, elegant and festive. Apple, peach and a clean toasty finish.", tags: ["classic", "festive", "crowd-pleaser"], badge: "✨", pairing: "Appetizers, soft cheeses, sushi" },
  { name: "Prosecco Superiore, Bisol", region: "Valdobbiadene, Italy", type: "sparkling", taste: ["fruity", "sweet", "light", "floral"], price: 22, desc: "Delicate pear, white flowers and a gentle, playful sparkle.", tags: ["light", "floral", "aperitivo"], badge: "✨", pairing: "Prosciutto, fruit, light starters" },
];

const tagColors = [
  { bg: "#EEEDFE", color: "#3C3489" },
  { bg: "#FAEEDA", color: "#633806" },
  { bg: "#E1F5EE", color: "#085041" },
];

const badgeBg = { red: "#FAECE7", white: "#FAEEDA", rosé: "#FBEAF0", sparkling: "#EAF3DE" };

function Chip({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 13,
        padding: "8px 18px",
        borderRadius: 40,
        border: selected ? "1.5px solid #7F77DD" : "0.5px solid #ccc",
        background: selected ? "#EEEDFE" : "white",
        color: selected ? "#3C3489" : "#555",
        cursor: "pointer",
        fontWeight: selected ? 500 : 400,
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function StepBar({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: "1.8rem" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: i < current ? "#7F77DD" : "#e5e5e5",
            transition: "background 0.3s",
          }}
        />
      ))}
    </div>
  );
}

function WineCard({ wine, showPairing }) {
  return (
    <div
      style={{
        border: "0.5px solid #e0e0e0",
        borderRadius: 14,
        padding: "1rem 1.25rem",
        marginBottom: 12,
        display: "flex",
        gap: "1rem",
        alignItems: "flex-start",
        cursor: "pointer",
        transition: "border-color 0.18s",
        background: "white",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "#7F77DD")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#e0e0e0")}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: badgeBg[wine.type] || "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {wine.badge}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "'Georgia', serif", fontSize: 18, fontWeight: 600, margin: "0 0 2px", color: "#1a1a1a" }}>{wine.name}</p>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 6px", letterSpacing: 0.3 }}>{wine.region}</p>
        <p style={{ fontSize: 13, color: "#555", margin: "0 0 8px", lineHeight: 1.5 }}>{wine.desc}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {wine.tags.map((t, i) => (
            <span key={t} style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: tagColors[i % 3].bg, color: tagColors[i % 3].color }}>
              {t}
            </span>
          ))}
          {showPairing && (
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: "#E1F5EE", color: "#085041" }}>
              pairs: {wine.pairing.split(",")[0].toLowerCase()}
            </span>
          )}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", margin: 0 }}>${wine.price}</p>
      </div>
    </div>
  );
}

export default function WineFlow() {
  const [step, setStep] = useState(1);
  const [colors, setColors] = useState([]);
  const [tastes, setTastes] = useState([]);
  const [occasion, setOccasion] = useState(null);
  const [budget, setBudget] = useState(40);
  const [experience, setExperience] = useState(null);
  const [food, setFood] = useState(null);
  const [results, setResults] = useState(null);

  const toggleMulti = (val, arr, setArr) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const computeResults = () => {
    const activeColors = colors.includes("any") ? ["red", "white", "rosé", "sparkling"] : colors;
    let scored = wines
      .filter(w => activeColors.length === 0 || activeColors.includes(w.type))
      .map(w => {
        let score = 0;
        tastes.forEach(t => { if (w.taste.includes(t)) score += 2; });
        if (w.price <= budget) score += 1;
        if (w.price > budget * 1.5) score -= 2;
        if (experience === "safe" && w.tags.includes("classic")) score += 1;
        if (experience === "bold" && (w.tags.includes("unique") || w.tags.includes("cellar-worthy"))) score += 1;
        if (occasion === "celebration" && (w.type === "sparkling" || w.tags.includes("luxury"))) score += 1;
        if (occasion === "date" && (w.tags.includes("elegant") || w.tags.includes("chic"))) score += 1;
        return { ...w, score };
      });
    scored.sort((a, b) => b.score - a.score);
    setResults(scored.slice(0, 4));
    setStep(5);
  };

  const reset = () => {
    setStep(1); setColors([]); setTastes([]); setOccasion(null);
    setBudget(40); setExperience(null); setFood(null); setResults(null);
  };

  const containerStyle = {
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    maxWidth: 640,
    margin: "0 auto",
    padding: "2rem 1.5rem",
    color: "#1a1a1a",
  };

  const titleStyle = {
    fontFamily: "'Georgia', serif",
    fontSize: 36,
    fontWeight: 500,
    margin: "0 0 4px",
    lineHeight: 1.1,
    letterSpacing: "-0.5px",
  };

  const subtitleStyle = {
    fontSize: 13,
    color: "#999",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    margin: "0 0 1.8rem",
  };

  const questionStyle = {
    fontFamily: "'Georgia', serif",
    fontSize: 21,
    fontStyle: "italic",
    fontWeight: 500,
    margin: "0 0 0.8rem",
  };

  const hintStyle = { fontSize: 12, color: "#aaa", margin: "0 0 1rem" };

  const chipGridStyle = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.5rem" };

  const navStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" };

  const nextBtn = (disabled, onClick, label = "Continue →") => (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        fontSize: 13,
        fontWeight: 500,
        padding: "10px 28px",
        background: disabled ? "#ccc" : "#3C3489",
        color: "white",
        border: "none",
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        transition: "background 0.18s",
      }}
    >
      {label}
    </button>
  );

  const backBtn = (onClick) => (
    <button onClick={onClick} style={{ fontSize: 13, color: "#999", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
      ← Back
    </button>
  );

  return (
    <div style={containerStyle}>
      {step === 1 && (
        <div>
          <p style={subtitleStyle}>Find your perfect pour</p>
          <h1 style={titleStyle}>Let's find your wine.</h1>
          <StepBar current={1} total={4} />
          <p style={questionStyle}>What kind of wine are you in the mood for?</p>
          <p style={hintStyle}>Select one or more</p>
          <div style={chipGridStyle}>
            {["red", "white", "rosé", "sparkling", "any"].map(c => (
              <Chip key={c} label={c === "any" ? "🎲 Surprise me" : { red: "🍷 Red", white: "🥂 White", rosé: "🌸 Rosé", sparkling: "✨ Sparkling" }[c]} selected={colors.includes(c)} onClick={() => toggleMulti(c, colors, setColors)} />
            ))}
          </div>
          <div style={navStyle}>
            <span />
            {nextBtn(colors.length === 0, () => setStep(2))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p style={subtitleStyle}>Find your perfect pour</p>
          <h1 style={titleStyle}>Your palate.</h1>
          <StepBar current={2} total={4} />
          <p style={questionStyle}>How do you like your wine to taste?</p>
          <p style={hintStyle}>Pick all that apply</p>
          <div style={chipGridStyle}>
            {["dry", "sweet", "fruity", "earthy", "bold", "light", "oaky", "floral"].map(t => (
              <Chip key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} selected={tastes.includes(t)} onClick={() => toggleMulti(t, tastes, setTastes)} />
            ))}
          </div>
          <div style={navStyle}>
            {backBtn(() => setStep(1))}
            {nextBtn(tastes.length === 0, () => setStep(3))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p style={subtitleStyle}>Find your perfect pour</p>
          <h1 style={titleStyle}>The occasion.</h1>
          <StepBar current={3} total={4} />
          <p style={questionStyle}>What's the occasion?</p>
          <div style={chipGridStyle}>
            {[["dinner", "Dinner party"], ["date", "Date night"], ["gift", "Gift"], ["casual", "Casual evening"], ["celebration", "Celebration"], ["pairing", "Food pairing"]].map(([val, label]) => (
              <Chip key={val} label={label} selected={occasion === val} onClick={() => setOccasion(val)} />
            ))}
          </div>
          <p style={{ ...questionStyle, marginTop: "1.2rem" }}>Your budget per bottle</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.5rem" }}>
            <span style={{ fontSize: 13, color: "#aaa" }}>$10</span>
            <input type="range" min={10} max={200} step={5} value={budget} onChange={e => setBudget(+e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: "#aaa" }}>$200</span>
            <span style={{ fontSize: 15, fontWeight: 500, minWidth: 48 }}>${budget}</span>
          </div>
          <div style={navStyle}>
            {backBtn(() => setStep(2))}
            {nextBtn(!occasion, () => setStep(4))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <p style={subtitleStyle}>Find your perfect pour</p>
          <h1 style={titleStyle}>Almost there.</h1>
          <StepBar current={4} total={4} />
          <p style={questionStyle}>How adventurous are you feeling?</p>
          <div style={chipGridStyle}>
            {[["safe", "Give me the classics"], ["explore", "Open to exploring"], ["bold", "Take me somewhere new"]].map(([val, label]) => (
              <Chip key={val} label={label} selected={experience === val} onClick={() => setExperience(val)} />
            ))}
          </div>
          <p style={{ ...questionStyle, marginTop: "1.2rem" }}>How important is the food pairing?</p>
          <div style={chipGridStyle}>
            {[["yes", "Very — I'm cooking tonight"], ["no", "Just for sipping"]].map(([val, label]) => (
              <Chip key={val} label={label} selected={food === val} onClick={() => setFood(val)} />
            ))}
          </div>
          <div style={navStyle}>
            {backBtn(() => setStep(3))}
            {nextBtn(!(experience && food), computeResults, "Find my wines →")}
          </div>
        </div>
      )}

      {step === 5 && results && (
        <div>
          <p style={subtitleStyle}>Curated for you</p>
          <h1 style={titleStyle}>Your recommendations.</h1>
          <p style={{ fontSize: 12, color: "#aaa", letterSpacing: 1, textTransform: "uppercase", margin: "1rem 0" }}>
            {results.length} wines selected for you
          </p>
          {results.map(w => <WineCard key={w.name} wine={w} showPairing={food === "yes"} />)}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              fontSize: 13,
              color: "#888",
              background: "none",
              border: "0.5px solid #ddd",
              padding: "8px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← Start over
          </button>
        </div>
      )}
    </div>
  );
}
