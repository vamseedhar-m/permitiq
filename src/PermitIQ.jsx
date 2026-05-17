import { useState, useRef, useEffect, useCallback } from "react";

const C = {
  red: "#C0461E", redHov: "#A33917", redLight: "#FCF0EB",
  black: "#222222", mid: "#484848", sub: "#717171", muted: "#B0B0B0",
  border: "#DDDDDD", borderSoft: "#EBEBEB",
  white: "#FFFFFF", soft: "#F7F7F7",
  shadowHov: "0 4px 8px rgba(0,0,0,0.08), 0 12px 36px rgba(0,0,0,0.13)",
  r: "12px", rLg: "16px", rFull: "9999px",
};

const VERDICT_CFG = {
  go:        { fg:"#166534", bg:"#F0FDF4", border:"#BBF7D0", icon:"✓" },
  caution:   { fg:"#92400E", bg:"#FFFBEB", border:"#FDE68A", icon:"!" },
  high_risk: { fg:"#991B1B", bg:"#FFF1F2", border:"#FECDD3", icon:"✕" },
};
const FLAG_CFG = {
  blocker: { fg:"#B91C1C", bg:"#FFF1F2", border:"#FECDD3", dot:"#EF4444", tag:"Blocker" },
  warning: { fg:"#92400E", bg:"#FFFBEB", border:"#FDE68A", dot:"#F59E0B", tag:"Warning" },
  info:    { fg:"#1E40AF", bg:"#EFF6FF", border:"#BFDBFE", dot:"#3B82F6", tag:"Info" },
};
const SEV_CFG = {
  major:    { fg:"#991B1B", bg:"#FFF1F2", border:"#FECDD3", tag:"Requires Variance" },
  moderate: { fg:"#92400E", bg:"#FFFBEB", border:"#FDE68A", tag:"Redesign Required" },
  minor:    { fg:"#065F46", bg:"#F0FDF4", border:"#A7F3D0", tag:"Add Document" },
};

const SYSTEM_PROMPT = `You are PermitIQ — an expert SF Building Permit Advisor.

Detect which stage applies:
- pre_purchase: Evaluating property to buy (Zillow, "for sale", "can I build", lot inquiry)
- proposal_review: Owns or has property, describing a specific project
- permit_prep: Ready to file ("proceed", "apply", "prepare permit", "file it")
- feedback_review: Has rejection letter or correction notice to understand or respond to

SF ZONING RULES — apply precisely with real numbers:
RH-1 (Single Family): 40% max lot coverage, rear yard = 45% of lot depth, 10ft side setbacks, 25ft front setback, 35ft height limit
RH-2 (Two Family): Similar to RH-1, allows 2 units
New SFH construction: Min 2,500 sqft lot; full Planning Dept review; 6-18 months
Lot coverage: 2,000 sqft lot x 40% = 800 sqft max footprint. 1,000 sqft on 2,000 sqft = 50% = VIOLATION
Rear yard: 100ft deep lot = 45ft. 80ft deep = 36ft. 25x100ft lot = 45ft rear yard required
Historic districts (Alamo Square, Duboce Park, Liberty Hill, Cole Valley, Noe Valley Victorian areas): Article 10 HPC review for ANY exterior change; window replacement must match original material and profile
ADU from existing structure: Can go to property line; new detached ADU needs 4ft setbacks, max 800 sqft
Decks over 30 inches: Count toward lot coverage; must meet rear yard setback
Structures under 120 sqft: Permit-exempt but setbacks still apply
Fire separation CRC R302.1: Structure within 5ft of property line requires 1-hour fire-rated wall assembly
Load-bearing wall removal: Requires stamped structural calculations from licensed CA Structural Engineer SE
ADU accessible path CBC 11B-404.2.4: Level 5ft x 5ft landing required at ADU entry
Plan check resubmittal: All revised sheets must be clouded and delta-tagged; written response required for each correction

RESPOND ONLY with a valid JSON object. No markdown fences, no preamble, no text outside JSON:
{
  "stage": "pre_purchase|proposal_review|permit_prep|feedback_review",
  "verdict": "go|caution|high_risk|null",
  "verdictLabel": "Looks Feasible|Proceed with Caution|High Risk|null",
  "summary": "2-3 sentence direct summary with specific numbers. User is making a financial decision.",
  "flags": [
    { "type": "blocker|warning|info", "title": "Short title", "detail": "Specific with numbers and real impact.", "code": "Code ref or null" }
  ],
  "corrections": [
    {
      "id": "01", "title": "Short correction title",
      "severity": "major|moderate|minor",
      "severityLabel": "Requires Variance|Redesign Required|Add Document",
      "explanation": "Clear terms: what went wrong and why it matters",
      "fix": "Exactly what needs to change or be submitted",
      "effort": "High - weeks to resolve|Medium - days to resolve|Low - hours to resolve",
      "code": "Code reference"
    }
  ],
  "permitFields": null,
  "questions": ["Specific clarifying question?"],
  "nextStageHint": "One-line actionable guidance on next step"
}

For permit_prep only, set permitFields to:
{ "projectAddress": "...", "projectType": "New Construction|Addition|ADU Conversion|Alteration|Deck|etc", "scopeOfWork": "...", "estimatedCost": "$X,XXX - $XX,XXX", "squareFootage": "XXX sqft", "zoningDistrict": "RH-1|RH-2|Unknown - verify at SF Planning", "requiredDocuments": ["doc1","doc2"], "estimatedTimeline": "X-Y months", "estimatedFees": "$X,XXX - $X,XXX" }

Only include corrections for feedback_review (else []). Flags only for non-feedback stages. Max 4 flags. Max 2 questions. Be specific.`;

const MODES = [
  {
    id: "pre_purchase", icon: "🏗️",
    headline: "Can I build this?",
    sub: "Check if a lot can support your vision before making an offer. We flag zoning issues, coverage limits, and setback violations upfront.",
    cta: "Check feasibility",
    placeholder: "Describe the property — address or lot size, and what you're hoping to build…",
    greeting: "Tell me about the property you're considering. Share the address or lot details, what you're hoping to build, and the rough footprint you have in mind. I'll check it against SF zoning rules and tell you what's feasible — and what isn't.",
  },
  {
    id: "proposal_review", icon: "📋",
    headline: "Prepare my permit",
    sub: "Validate your project against SF's Planning Code, identify every requirement gap, and generate a ready-to-file application draft.",
    cta: "Start permit prep",
    placeholder: "Describe your project — what you own, where it is, and what you're planning…",
    greeting: "Tell me about your property and the project you're planning. Include the address, what the property currently looks like, and what you want to add or modify. The more detail you share, the more complete my review will be.",
  },
  {
    id: "feedback_review", icon: "✉️",
    headline: "Got a rejection?",
    sub: "Paste your correction notice for a breakdown of each issue — what it means, how urgent it is, and exactly what to change before resubmitting.",
    cta: "Review my rejection",
    placeholder: "Paste your plan check correction notice here, or describe what the reviewer flagged…",
    greeting: "Paste your plan check correction notice below — the full text works best. I'll triage each item by severity, explain what each one means and why it matters, and tell you exactly what needs to change before you resubmit.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INCOMPLETE_KW = ["unknown", "verify", "n/a", "tbd", "not provided", "insufficient", "confirm"];
function isIncomplete(val) {
  const s = (Array.isArray(val) ? val.join(" ") : String(val ?? "")).toLowerCase();
  return INCOMPLETE_KW.some(k => s.includes(k));
}

function getCodeUrl(code) {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c.includes("planning code") || c.includes("article") || c.includes("section 1") || c.includes("section 2") || c.includes("section 3"))
    return "https://codelibrary.amlegal.com/codes/san_francisco/latest/sf_planning/";
  if (c.includes("sf building code") || c.includes("sfbc") || c.includes("106a"))
    return "https://codelibrary.amlegal.com/codes/san_francisco/latest/sf_building/";
  if (c.includes("crc") || c.includes("r302") || c.includes("california residential"))
    return "https://up.codes/codes/california-residential-code";
  if (c.includes("cbc") || c.includes("11b") || c.includes("california building"))
    return "https://up.codes/codes/california-building-code";
  return null;
}

function downloadDoc(type, data) {
  const title = type === "permit" ? "Permit Application Draft" : "Correction Response Plan";
  const filename = type === "permit" ? "permit-application.html" : "resubmission-plan.html";
  const accent = "#C0461E";
  let body = "";
  if (type === "permit") {
    const rows = Object.entries(data).filter(([, v]) => v);
    const incKw = ["unknown", "verify", "n/a", "tbd", "not provided", "insufficient", "confirm"];
    body = `<table style="width:100%;border-collapse:collapse;">${rows.map(([key, val]) => {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
      const strVal = Array.isArray(val) ? val.join(" ") : String(val);
      const inc = incKw.some(k => strVal.toLowerCase().includes(k));
      const value = Array.isArray(val)
        ? `<ul style="margin:4px 0 0 0;padding-left:18px;">${val.map(v => `<li>${v}</li>`).join("")}</ul>`
        : `<span>${val}</span>`;
      const badge = inc ? `<span style="margin-left:8px;font-size:10px;font-weight:700;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px;padding:1px 7px;">⚠ Verify</span>` : "";
      return `<tr style="${inc ? "background:#FFFDF5;" : ""}"><td style="color:#717171;padding:10px 16px 10px 0;vertical-align:top;width:180px;font-size:13px;">${label}</td><td style="color:#222;font-weight:500;padding:10px 0;font-size:13px;">${value}${badge}</td></tr>`;
    }).join("")}</table>`;
  } else {
    const sc = { major:"#B91C1C", moderate:"#92400E", minor:"#065F46" };
    body = data.map(c => `<div style="border:1px solid #ddd;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="background:#f5f5f5;border-radius:6px;padding:3px 10px;font-weight:700;font-size:13px;">${c.id}</span>
        <strong style="font-size:15px;">${c.title}</strong>
        <span style="margin-left:auto;font-size:11px;font-weight:700;color:${sc[c.severity]||"#666"};">${c.severityLabel}</span>
      </div>
      <p style="color:#484848;font-size:13px;margin:0 0 10px;">${c.explanation}</p>
      <div style="background:#f7f7f7;border-left:3px solid ${sc[c.severity]||"#999"};padding:10px 14px;border-radius:0 6px 6px 0;">
        <div style="font-size:11px;font-weight:700;color:#717171;letter-spacing:.05em;margin-bottom:4px;">REQUIRED FIX</div>
        <p style="margin:0;font-size:13px;color:#222;">${c.fix}</p>
      </div>
      ${c.code ? `<div style="margin-top:8px;font-size:11px;color:#aaa;font-family:monospace;">Ref: ${c.code}</div>` : ""}
    </div>`).join("");
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#222;}
    h1{font-size:26px;font-weight:600;color:${accent};border-bottom:2px solid ${accent};padding-bottom:14px;margin-bottom:28px;}
    .meta{font-size:12px;color:#999;margin-bottom:32px;}</style></head>
    <body><h1>${title}</h1>
    <div class="meta">Generated by PermitIQ · SF Residential Permits · For informational use only — verify with SF Planning Dept</div>
    ${body}</body></html>`;
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }
}

// ─── Small Components ─────────────────────────────────────────────────────────

function Logo({ size = 32 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: size, height: size, background: C.red, borderRadius: Math.round(size * 0.28), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.47) }}>P</div>
      <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: Math.round(size * 0.65), fontWeight: 400, color: C.black, letterSpacing: "-0.02em" }}>PermitIQ</span>
    </div>
  );
}

function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, background: "transparent", color: C.mid, border: `1px solid ${C.border}`, borderRadius: C.rFull, padding: "9px 18px", cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.black; e.currentTarget.style.color = C.black; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}>
      {children}
    </button>
  );
}

function ApiKeyBtn({ apiKeySet, onClick }) {
  return (
    <button onClick={onClick} style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14, background: apiKeySet ? "#F0FDF4" : "transparent", color: apiKeySet ? "#166534" : C.mid, border: `1px solid ${apiKeySet ? "#BBF7D0" : C.border}`, borderRadius: C.rFull, padding: "9px 18px", cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = apiKeySet ? "#86EFAC" : C.black}
      onMouseLeave={e => e.currentTarget.style.borderColor = apiKeySet ? "#BBF7D0" : C.border}>
      {apiKeySet ? "✓ API Key set" : "Set API Key"}
    </button>
  );
}

function CodeLink({ code }) {
  if (!code) return null;
  const url = getCodeUrl(code);
  if (!url) return <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{code}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", textDecoration: "none", transition: "color 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.color = C.mid; e.currentTarget.style.textDecoration = "underline"; }}
      onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.textDecoration = "none"; }}>
      {code} ↗
    </a>
  );
}

function VerdictBadge({ verdict, label }) {
  if (!verdict || !VERDICT_CFG[verdict]) return null;
  const v = VERDICT_CFG[verdict];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: v.bg, border: `1.5px solid ${v.border}`, borderRadius: C.rFull, padding: "6px 16px", marginBottom: 14 }}>
      <span style={{ fontWeight: 700, color: v.fg, fontSize: 14 }}>{v.icon} {label}</span>
    </div>
  );
}

function FlagCard({ flag }) {
  const f = FLAG_CFG[flag.type] || FLAG_CFG.info;
  return (
    <div style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: C.r, padding: "12px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: f.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: f.fg, letterSpacing: "0.07em", textTransform: "uppercase" }}>{f.tag}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.black }}>{flag.title}</span>
        {flag.code && <span style={{ marginLeft: "auto" }}><CodeLink code={flag.code} /></span>}
      </div>
      <p style={{ margin: "0 0 0 15px", fontSize: 13, color: C.mid, lineHeight: 1.65 }}>{flag.detail}</p>
    </div>
  );
}

function CorrectionCard({ c }) {
  const s = SEV_CFG[c.severity] || SEV_CFG.moderate;
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: C.r, padding: "18px 20px", marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: s.bg, border: `1.5px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: s.fg }}>{c.id}</div>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.black }}>{c.title}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: s.fg, background: s.bg, border: `1px solid ${s.border}`, borderRadius: C.rFull, padding: "3px 11px", whiteSpace: "nowrap" }}>{s.tag}</span>
          <span style={{ fontSize: 11, color: C.muted }}>{c.effort}</span>
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: C.mid, lineHeight: 1.65 }}>{c.explanation}</p>
      <div style={{ background: C.soft, borderRadius: 9, padding: "12px 14px", borderLeft: `3px solid ${s.fg}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: "0.06em", marginBottom: 5 }}>REQUIRED FIX</div>
        <p style={{ margin: 0, fontSize: 13, color: C.black, lineHeight: 1.6 }}>{c.fix}</p>
      </div>
      {c.code && <div style={{ marginTop: 9 }}><CodeLink code={c.code} /></div>}
    </div>
  );
}

function PermitDraft({ fields }) {
  if (!fields) return null;
  const rows = Object.entries(fields).filter(([, v]) => v);
  const incompleteCount = rows.filter(([, v]) => isIncomplete(v)).length;
  return (
    <div style={{ background: C.soft, border: `1px solid ${C.borderSoft}`, borderRadius: C.r, padding: "18px 20px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: "0.08em", textTransform: "uppercase" }}>Permit Application Draft</div>
        {incompleteCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: C.rFull, padding: "3px 10px" }}>
            <span style={{ fontSize: 11 }}>⚠</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#92400E" }}>{incompleteCount} field{incompleteCount > 1 ? "s" : ""} need verification</span>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {rows.map(([key, val]) => {
          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
          const incomplete = isIncomplete(val);
          return (
            <div key={key} style={{ display: "flex", gap: 14, fontSize: 14, padding: "9px 10px", margin: "0 -10px", borderRadius: 8, background: incomplete ? "#FFFDF5" : "transparent", borderLeft: incomplete ? "3px solid #FDE68A" : "3px solid transparent" }}>
              <span style={{ color: C.sub, minWidth: 155, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1 }}>
                <span style={{ color: incomplete ? "#92400E" : C.black, fontWeight: 500, lineHeight: 1.55 }}>
                  {Array.isArray(val)
                    ? <ul style={{ margin: 0, padding: "0 0 0 16px" }}>{val.map((v, i) => <li key={i} style={{ color: C.mid, marginBottom: 3 }}>{v}</li>)}</ul>
                    : val}
                </span>
                {incomplete && <div style={{ fontSize: 11, color: "#92400E", marginTop: 2, fontWeight: 500 }}>Needs verification before filing</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionChips({ questions, onQueue }) {
  const [expanded, setExpanded] = useState(null);
  const [chipInput, setChipInput] = useState("");
  const [answered, setAnswered] = useState(new Set());
  const chipInputRef = useRef(null);
  if (!questions?.length) return null;

  const handleChipClick = (i) => {
    if (answered.has(i)) return;
    if (expanded === i) { setExpanded(null); setChipInput(""); return; }
    setExpanded(i);
    setChipInput("");
    setTimeout(() => chipInputRef.current?.focus(), 40);
  };
  const handleQueue = (i) => {
    if (!chipInput.trim()) return;
    onQueue(questions[i], chipInput.trim());
    setAnswered(prev => new Set([...prev, i]));
    setExpanded(null); setChipInput("");
  };

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 11, color: C.sub, marginBottom: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>Clarifying questions</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((q, i) => {
          const isAnswered = answered.has(i);
          const isExpanded = expanded === i;
          return (
            <div key={i}>
              <button onClick={() => handleChipClick(i)} disabled={isAnswered} style={{ width: "100%", textAlign: "left", cursor: isAnswered ? "default" : "pointer", background: isAnswered ? C.soft : C.white, border: `1.5px solid ${isAnswered ? C.borderSoft : isExpanded ? C.red : C.border}`, borderRadius: isExpanded ? "10px 10px 0 0" : 10, padding: "11px 15px", fontSize: 13, lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 9, color: isAnswered ? C.muted : isExpanded ? C.red : C.mid }}
                onMouseEnter={e => { if (!isAnswered && !isExpanded) { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.black; }}}
                onMouseLeave={e => { if (!isAnswered && !isExpanded) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{isAnswered ? "✓" : isExpanded ? "▾" : "↩"}</span>
                <span style={{ textDecoration: isAnswered ? "line-through" : "none" }}>{q}</span>
              </button>
              {isExpanded && (
                <div style={{ border: `1.5px solid ${C.red}`, borderTop: `1px solid ${C.borderSoft}`, borderRadius: "0 0 10px 10px", background: "#FDFAF9", padding: "10px 13px", display: "flex", gap: 8, alignItems: "center" }}>
                  <input ref={chipInputRef} value={chipInput} onChange={e => setChipInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleQueue(i); } if (e.key === "Escape") { setExpanded(null); setChipInput(""); } }}
                    placeholder="Type your answer…"
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: C.black, fontFamily: "'DM Sans', sans-serif", background: "transparent" }} />
                  <button onClick={() => handleQueue(i)} disabled={!chipInput.trim()} style={{ background: chipInput.trim() ? C.red : C.borderSoft, color: chipInput.trim() ? "#fff" : C.muted, border: "none", borderRadius: 7, padding: "6px 13px", fontSize: 12, fontWeight: 600, cursor: chipInput.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>Queue ✓</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NextHint({ hint }) {
  if (!hint) return null;
  return <div style={{ marginTop: 16, background: C.redLight, borderRadius: 9, padding: "11px 15px", fontSize: 13, color: C.red, fontWeight: 500 }}>→ {hint}</div>;
}

function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0" }}>
      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.border, animation: `bloop 1.2s ${i*0.16}s ease-in-out infinite` }} />)}
      <span style={{ fontSize: 13, color: C.muted, marginLeft: 4 }}>Checking SF Planning Code…</span>
    </div>
  );
}

function AIAvatar() {
  return <div style={{ width: 34, height: 34, borderRadius: 11, background: C.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>P</div>;
}

function AIBubble({ parsed, onQueue, onRetry }) {
  const { verdict, verdictLabel, summary, flags = [], corrections = [], permitFields, questions = [], nextStageHint, isError, retryText, errorDetail } = parsed;

  if (isError) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AIAvatar />
        <div style={{ background: "#FFF8F6", border: "1px solid #F5D0C5", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
          <p style={{ fontSize: 14, color: C.sub, margin: "0 0 6px", lineHeight: 1.6 }}>Something went wrong reaching the server. Your message is saved — no need to retype.</p>
          {errorDetail && <p style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", margin: "0 0 12px", lineHeight: 1.5 }}>{errorDetail}</p>}
          <button onClick={() => onRetry(retryText)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.red, color: "#fff", border: "none", borderRadius: C.rFull, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            onMouseEnter={e => e.currentTarget.style.background = C.redHov}
            onMouseLeave={e => e.currentTarget.style.background = C.red}>
            ↺ Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <AIAvatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <VerdictBadge verdict={verdict} label={verdictLabel} />
        {summary && <p style={{ fontSize: 15, color: C.mid, lineHeight: 1.75, margin: "0 0 14px" }}>{summary}</p>}
        {flags.map((f, i) => <FlagCard key={i} flag={f} />)}
        {corrections.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.sub, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 12px" }}>
              Corrections Required — {corrections.length} item{corrections.length !== 1 ? "s" : ""}
            </p>
            {corrections.map((c, i) => <CorrectionCard key={i} c={c} />)}
            <button onClick={() => downloadDoc("corrections", corrections)} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 4, background: C.soft, border: `1px solid ${C.border}`, borderRadius: C.rFull, padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}>
              ↓ Download resubmission plan
            </button>
          </div>
        )}
        <PermitDraft fields={permitFields} />
        {permitFields && (
          <button onClick={() => downloadDoc("permit", permitFields)} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, background: C.soft, border: `1px solid ${C.border}`, borderRadius: C.rFull, padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.mid; }}>
            ↓ Download permit application
          </button>
        )}
        <QuestionChips questions={questions} onQueue={onQueue} />
        <NextHint hint={nextStageHint} />
      </div>
    </div>
  );
}

function GreetingBubble({ text }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <AIAvatar />
      <div style={{ background: C.soft, borderRadius: "4px 16px 16px 16px", padding: "14px 18px", maxWidth: "82%" }}>
        <p style={{ fontSize: 15, color: C.mid, lineHeight: 1.75, margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

function UserBubble({ content }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ background: C.black, color: "#fff", borderRadius: "16px 4px 16px 16px", padding: "13px 17px", maxWidth: "76%", fontSize: 15, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{content}</div>
    </div>
  );
}

function ApiKeyModal({ onSave, onClose }) {
  const [key, setKey] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: C.rLg, padding: "32px 36px", maxWidth: 480, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, fontWeight: 400, margin: "0 0 8px", letterSpacing: "-0.02em" }}>Set API Key</h3>
        <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.65, margin: "0 0 24px" }}>Enter your Anthropic API key to use PermitIQ. Your key is stored in-session only and never transmitted anywhere except the Anthropic API.</p>
        <input value={key} onChange={e => setKey(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && key.trim()) onSave(key.trim()); }}
          placeholder="sk-ant-..." type="password"
          style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: C.r, padding: "13px 16px", fontSize: 14, color: C.black, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 16 }}
          onFocus={e => e.target.style.borderColor = C.black}
          onBlur={e => e.target.style.borderColor = C.border}
          autoFocus />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <button onClick={() => key.trim() && onSave(key.trim())} style={{ background: key.trim() ? C.red : C.borderSoft, color: key.trim() ? "#fff" : C.muted, border: "none", borderRadius: C.rFull, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: key.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif" }}>Save key</button>
        </div>
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({ onMode, onFreeText, onOpenApiKeyModal, apiKeySet }) {
  const [freeInput, setFreeInput] = useState("");
  const taRef = useRef(null);

  const adjustTa = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  return (
    <div style={{ minHeight: "100vh", background: C.white, fontFamily: "'DM Sans', sans-serif", color: C.black }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.borderSoft}`, padding: "0 40px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo size={34} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            style={{ background: "none", border: "none", fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: C.mid, cursor: "pointer", padding: "8px 12px", transition: "color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = C.black}
            onMouseLeave={e => e.currentTarget.style.color = C.mid}>How it works</button>
          <ApiKeyBtn apiKeySet={apiKeySet} onClick={onOpenApiKeyModal} />
        </div>
      </nav>

      <section style={{ padding: "80px 40px 56px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: C.redLight, color: C.red, borderRadius: C.rFull, padding: "6px 18px", fontSize: 13, fontWeight: 600, marginBottom: 28, letterSpacing: "0.02em" }}>San Francisco Residential Permits</div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(38px, 6vw, 60px)", fontWeight: 400, lineHeight: 1.1, color: C.black, margin: "0 0 26px", letterSpacing: "-0.03em" }}>
          Know before you build.<br />
          <em style={{ color: C.red }}>Navigate SF permits with confidence.</em>
        </h1>
        <p style={{ fontSize: 18, color: C.sub, lineHeight: 1.7, maxWidth: 560, margin: "0 auto 0" }}>
          Check feasibility, validate your plans against 70+ SF zoning rules, and turn permit rejections into a clear action plan.
        </p>
      </section>

      <section style={{ padding: "40px 40px 64px", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {MODES.map(mode => (
            <div key={mode.id} onClick={() => onMode(mode)} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: C.rLg, padding: "30px 28px 26px", cursor: "pointer", transition: "all 0.22s", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = C.shadowHov; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = C.black; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = C.border; }}>
              <div style={{ fontSize: 34, marginBottom: 18, lineHeight: 1 }}>{mode.icon}</div>
              <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, fontWeight: 400, color: C.black, margin: "0 0 10px", lineHeight: 1.15, letterSpacing: "-0.02em" }}>{mode.headline}</h3>
              <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.7, margin: "0 0 24px" }}>{mode.sub}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.red, fontWeight: 600, fontSize: 15 }}>{mode.cta} <span style={{ fontSize: 17 }}>→</span></div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 40px 72px", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${C.border}, transparent)`, marginBottom: 40 }} />
        <p style={{ textAlign: "center", fontSize: 16, color: C.sub, marginBottom: 20 }}>Or just describe your situation — we'll figure out the right flow:</p>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: C.r, background: C.white, overflow: "hidden", transition: "border-color 0.2s" }}
            onFocusCapture={e => e.currentTarget.style.borderColor = C.black}
            onBlurCapture={e => e.currentTarget.style.borderColor = C.border}>
            <textarea ref={taRef} value={freeInput}
              onChange={e => { setFreeInput(e.target.value); adjustTa(); }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && freeInput.trim()) { e.preventDefault(); onFreeText(freeInput); } }}
              placeholder='e.g. "I saw a 2,000 sqft lot on Zillow in the Mission — can I build a house on it?"'
              rows={2}
              style={{ width: "100%", display: "block", border: "none", outline: "none", padding: "15px 17px", fontSize: 15, color: C.black, fontFamily: "'DM Sans', sans-serif", resize: "none", background: "#fff", minHeight: 54, lineHeight: 1.55, boxSizing: "border-box", boxShadow: "none" }} />
          </div>
          <button onClick={() => freeInput.trim() && onFreeText(freeInput)}
            style={{ background: freeInput.trim() ? C.red : C.borderSoft, color: freeInput.trim() ? "#fff" : C.muted, border: "none", borderRadius: C.r, padding: "15px 22px", fontSize: 15, fontWeight: 600, cursor: freeInput.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", transition: "all 0.18s", flexShrink: 0, alignSelf: "stretch" }}>Go →</button>
        </div>
      </section>

      <section id="how-it-works" style={{ background: C.soft, padding: "64px 40px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, fontWeight: 400, textAlign: "center", margin: "0 0 52px", letterSpacing: "-0.02em" }}>How PermitIQ works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
            {[
              { n:"01", title:"Describe your situation", desc:"Tell us about a property you're eyeing, a project you're planning to modify, or paste a correction notice from the city. No forms required — just describe what's going on." },
              { n:"02", title:"Get a clear analysis", desc:"PermitIQ cross-checks your situation against 70+ SF zoning rules, flagging every blocker, risk, and missing requirement with specific code citations and real numbers." },
              { n:"03", title:"Act with confidence", desc:"Walk away with a feasibility verdict, a completed permit application draft, or a step-by-step resubmission plan ready to hand to your architect or contractor." },
            ].map(s => (
              <div key={s.n}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red, letterSpacing: "0.09em", marginBottom: 12 }}>STEP {s.n}</div>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, fontWeight: 400, margin: "0 0 12px", letterSpacing: "-0.01em", lineHeight: 1.2 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.75, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: "24px 40px", borderTop: `1px solid ${C.borderSoft}`, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Covers SF residential zoning (RH-1 / RH-2) · For informational use only — not legal or planning advice · Always verify with the SF Planning Department.</p>
      </footer>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ mode, messages, loading, onSend, onRetry, onOpenApiKeyModal, apiKeySet, onBack }) {
  const [input, setInput] = useState("");
  const [queuedAnswers, setQueuedAnswers] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, queuedAnswers]);

  const adjustTa = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const send = (text) => {
    const msg = (text !== undefined ? text : input).trim();
    if (!msg || loading) return;
    if (text === undefined) { setInput(""); if (taRef.current) taRef.current.style.height = "52px"; }
    onSend(msg);
  };

  const handleQueueAnswer = (question, answer) => setQueuedAnswers(prev => [...prev, { question, answer }]);
  const handleRemoveQueued = (i) => setQueuedAnswers(prev => prev.filter((_, idx) => idx !== i));
  const handleSendAll = () => {
    if (!queuedAnswers.length || loading) return;
    const compiled = queuedAnswers.map(qa => `"${qa.question}" → ${qa.answer}`).join("\n");
    setQueuedAnswers([]);
    onSend(compiled);
  };

  const modeInfo = MODES.find(m => m.id === mode?.id) || MODES[0];

  return (
    <div style={{ minHeight: "100vh", background: C.white, fontFamily: "'DM Sans', sans-serif", color: C.black, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.borderSoft}`, padding: "0 32px", height: 66, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GhostBtn onClick={onBack}>← Back</GhostBtn>
          <ApiKeyBtn apiKeySet={apiKeySet} onClick={onOpenApiKeyModal} />
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.redLight, borderRadius: C.rFull, padding: "7px 15px" }}>
            <span style={{ fontSize: 16 }}>{modeInfo.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{modeInfo.headline}</span>
          </div>
        </div>
        <Logo size={30} />
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "36px 32px", maxWidth: 840, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <GreetingBubble text={modeInfo.greeting} />
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user"
                ? <UserBubble content={msg.content} />
                : <AIBubble parsed={msg.parsed} onQueue={handleQueueAnswer} onRetry={onRetry} />}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <AIAvatar />
              <TypingDots />
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.white, padding: "16px 32px 22px" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          {queuedAnswers.length > 0 && (
            <div style={{ background: C.soft, border: `1.5px solid ${C.border}`, borderRadius: C.r, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, letterSpacing: "0.07em", textTransform: "uppercase" }}>{queuedAnswers.length} answer{queuedAnswers.length > 1 ? "s" : ""} queued</span>
                <span style={{ fontSize: 12, color: C.muted }}>Send together for best results</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {queuedAnswers.map((qa, i) => (
                  <div key={i} style={{ background: C.white, borderRadius: 9, padding: "10px 13px", border: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qa.question}</p>
                      <p style={{ fontSize: 13, color: C.black, fontWeight: 500, margin: 0 }}>→ {qa.answer}</p>
                    </div>
                    <button onClick={() => handleRemoveQueued(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, lineHeight: 1, padding: "2px 4px", flexShrink: 0, transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = C.black}
                      onMouseLeave={e => e.currentTarget.style.color = C.muted}>×</button>
                  </div>
                ))}
              </div>
              <button onClick={handleSendAll} disabled={loading} style={{ width: "100%", background: loading ? C.borderSoft : C.red, color: loading ? C.muted : "#fff", border: "none", borderRadius: C.rFull, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", transition: "background 0.18s" }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = C.redHov; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = C.red; }}>
                Send {queuedAnswers.length} answer{queuedAnswers.length > 1 ? "s" : ""} →
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, border: `1.5px solid ${inputFocused ? C.black : C.border}`, borderRadius: C.r, background: C.white, overflow: "hidden", transition: "border-color 0.2s" }}>
              <textarea ref={taRef} value={input}
                onChange={e => { setInput(e.target.value); adjustTa(); }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={modeInfo.placeholder}
                rows={1}
                style={{ width: "100%", display: "block", border: "none", outline: "none", padding: "15px 17px", fontSize: 15, color: C.black, fontFamily: "'DM Sans', sans-serif", resize: "none", background: "#fff", minHeight: 52, maxHeight: 140, lineHeight: 1.55, boxSizing: "border-box", boxShadow: "none", overflowY: "hidden" }} />
            </div>
            <button onClick={() => send()} disabled={!input.trim() || loading}
              style={{ width: 52, height: 52, borderRadius: C.r, border: "none", flexShrink: 0, background: (input.trim() && !loading) ? C.red : C.soft, color: (input.trim() && !loading) ? "#fff" : C.muted, fontSize: 20, cursor: (input.trim() && !loading) ? "pointer" : "default", transition: "all 0.18s", fontWeight: 700 }}>↑</button>
          </div>
          <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginTop: 11 }}>Covers SF residential zoning (RH-1/RH-2) · Not legal advice · Verify with SF Planning Dept</p>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function PermitIQ() {
  const [view, setView] = useState("landing");
  const [activeMode, setActiveMode] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const messagesRef = useRef([]);
  const loadingRef = useRef(false);
  const pendingRef = useRef(null);
  const apiKeyRef = useRef("");

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const sendMessage = useCallback(async (text) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const history = [...messagesRef.current, { role: "user", content: text }];
    setMessages(history);
    messagesRef.current = history;

    let errorDetail = null;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          ...(apiKeyRef.current ? { "x-api-key": apiKeyRef.current } : {}),
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: history.map(m => ({ role: m.role, content: m.content ?? JSON.stringify(m.parsed ?? "") })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.type === "error") {
        errorDetail = data.error?.message || `API error ${res.status}`;
        throw new Error(errorDetail);
      }
      const raw = data.content?.find(b => b.type === "text")?.text || "{}";
      let parsed;
      try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
      catch {
        errorDetail = "Response was cut off — please retry.";
        parsed = { isError: true, retryText: text, errorDetail, flags: [], corrections: [], questions: [], stage: null, verdict: null };
      }
      if (parsed.stage) {
        const matched = MODES.find(m => m.id === parsed.stage);
        if (matched) setActiveMode(prev => prev?.id !== matched.id ? matched : prev);
      }
      const next = [...history, { role: "assistant", content: raw, parsed }];
      setMessages(next);
      messagesRef.current = next;
    } catch (err) {
      const detail = errorDetail || err?.message || "Unknown error";
      const errState = [...history, { role: "assistant", parsed: { isError: true, retryText: text, errorDetail: detail, flags: [], corrections: [], questions: [], stage: null, verdict: null } }];
      setMessages(errState);
      messagesRef.current = errState;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "chat" && pendingRef.current) {
      const msg = pendingRef.current;
      pendingRef.current = null;
      sendMessage(msg);
    }
  }, [view, sendMessage]);

  const handleRetry = useCallback((text) => {
    loadingRef.current = false;
    setLoading(false);
    const trimmed = messagesRef.current.slice(0, -2);
    setMessages(trimmed);
    messagesRef.current = trimmed;
    sendMessage(text);
  }, [sendMessage]);

  const startMode = (mode) => {
    setActiveMode(mode);
    setMessages([]);
    messagesRef.current = [];
    setView("chat");
  };

  const handleFreeText = (text) => {
    setActiveMode(MODES[0]);
    setMessages([]);
    messagesRef.current = [];
    pendingRef.current = text;
    setView("chat");
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }
        textarea { box-shadow: none; -webkit-appearance: none; }
        textarea::placeholder { color: #B0B0B0; }
        @keyframes bloop { 0%,60%,100% { transform:translateY(0); opacity:0.3; } 30% { transform:translateY(-7px); opacity:1; } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
      `}</style>

      {showApiKeyModal && (
        <ApiKeyModal
          onSave={key => { apiKeyRef.current = key; setApiKeySet(true); setShowApiKeyModal(false); }}
          onClose={() => setShowApiKeyModal(false)}
        />
      )}

      {view === "landing"
        ? <LandingPage onMode={startMode} onFreeText={handleFreeText} onOpenApiKeyModal={() => setShowApiKeyModal(true)} apiKeySet={apiKeySet} />
        : <ChatView mode={activeMode} messages={messages} loading={loading} onSend={sendMessage} onRetry={handleRetry} onOpenApiKeyModal={() => setShowApiKeyModal(true)} apiKeySet={apiKeySet} onBack={() => { setView("landing"); setMessages([]); messagesRef.current = []; }} />
      }
    </>
  );
}
