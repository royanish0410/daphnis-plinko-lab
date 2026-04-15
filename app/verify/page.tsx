"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PAYTABLE: Record<number, number> = {
  0:16,1:9,2:4,3:2,4:1.4,5:1.1,6:0.5,7:1.1,8:1.4,9:2,10:4,11:9,12:16,
};
const BIN_COLORS = ["#ff2255","#ff5500","#ff8800","#ffbb00","#ffe066","#ccff66","#66ffcc","#ccff66","#ffe066","#ffbb00","#ff8800","#ff5500","#ff2255"];

interface VerifyResult {
  commitHex: string;
  combinedSeed: string;
  pegMapHash: string;
  binIndex: number;
  decisions: string[];
  payoutMultiplier: number;
  pegMap: number[][];
  matches: { commitHex:boolean; combinedSeed:boolean; pegMapHash:boolean; binIndex:boolean; overall:boolean } | null;
  storedRound: { id:string; commitHex:string; combinedSeed:string; pegMapHash:string; binIndex:number; dropColumn:number; } | null;
}

function Field({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: "0.68rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>{label}</p>
      <p style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", fontSize: "0.72rem", color: color || "rgba(255,255,255,0.8)", wordBreak: "break-all", lineHeight: 1.5 }}>{value}</p>
    </div>
  );
}

function MatchRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.45rem 0.75rem", background: ok ? "rgba(0,255,136,0.06)" : "rgba(255,51,102,0.06)", borderRadius: "8px", marginBottom: "4px" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <span style={{ fontSize: "1rem" }}>{ok ? "✅" : "❌"}</span>
    </div>
  );
}

function PathReplay({ decisions, binIndex }: { decisions: string[]; binIndex: number }) {
  const W = 480, H = 320;
  const ROWS = 12, PAD_X = 28, PAD_TOP = 20, PAD_BOT = 45;
  const boardW = W - PAD_X * 2, boardH = H - PAD_TOP - PAD_BOT;
  const rowSpacing = boardH / (ROWS + 1), colSpacing = boardW / 12;

  function getPegPos(row: number, peg: number) {
    const numPegs = row + 2, totalWidth = (numPegs - 1) * colSpacing;
    const startX = PAD_X + (boardW - totalWidth) / 2;
    return { x: startX + peg * colSpacing, y: PAD_TOP + (row + 1) * rowSpacing };
  }
  function getBinX(b: number) { return PAD_X + b * colSpacing; }

  const pathPts: { x: number; y: number }[] = [];
  let pos = 0;
  for (let r = 0; r < ROWS; r++) {
    const { x, y } = getPegPos(r, pos);
    pathPts.push({ x, y });
    if (decisions[r] === "R") pos++;
  }
  pathPts.push({ x: getBinX(binIndex), y: H - PAD_BOT + 4 });

  const pathD = pathPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} style={{ maxWidth: "100%", borderRadius: "10px", background: "rgba(0,0,0,0.2)" }}>
      {/* Pegs */}
      {Array.from({ length: ROWS }).map((_, r) =>
        Array.from({ length: r + 2 }).map((_, p) => {
          const { x, y } = getPegPos(r, p);
          return <circle key={`${r}-${p}`} cx={x} cy={y} r={3.5} fill="rgba(200,220,255,0.85)" />;
        })
      )}
      {/* Bins */}
      {Array.from({ length: 13 }).map((_, b) => {
        const bx = getBinX(b), by = H - PAD_BOT + 4, bw = colSpacing * 0.8, bh = PAD_BOT - 10;
        const color = BIN_COLORS[b];
        return (
          <g key={b}>
            <rect x={bx - bw/2} y={by} width={bw} height={bh} rx={3}
              fill={b === binIndex ? `${color}55` : `${color}22`}
              stroke={color} strokeWidth={b === binIndex ? 2 : 0.8} strokeOpacity={b === binIndex ? 1 : 0.5} />
            <text x={bx} y={by + bh - 4} textAnchor="middle" fontSize={8} fill={color} fontFamily="monospace">{PAYTABLE[b]}x</text>
          </g>
        );
      })}
      {/* Ball path */}
      <path d={pathD} fill="none" stroke="rgba(245,197,24,0.6)" strokeWidth={2} strokeDasharray="4,3" />
      {pathPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pathPts.length - 1 ? 7 : 4}
          fill={i === pathPts.length - 1 ? BIN_COLORS[binIndex] : "rgba(245,197,24,0.8)"}
          opacity={i === pathPts.length - 1 ? 1 : 0.6} />
      ))}
    </svg>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const [serverSeed, setServerSeed] = useState(searchParams.get("serverSeed") || "");
  const [clientSeed, setClientSeed] = useState(searchParams.get("clientSeed") || "");
  const [nonce, setNonce] = useState(searchParams.get("nonce") || "");
  const [dropColumn, setDropColumn] = useState(parseInt(searchParams.get("dropColumn") || "6"));
  const [roundId, setRoundId] = useState(searchParams.get("roundId") || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [showPegMap, setShowPegMap] = useState(false);

  // Auto-fetch round if roundId param is present
  useEffect(() => {
    const rid = searchParams.get("roundId");
    if (rid) {
      fetch(`/api/rounds/${rid}`)
        .then(r => r.json())
        .then(d => {
          if (d.round) {
            const rnd = d.round;
            if (rnd.serverSeed) setServerSeed(rnd.serverSeed);
            if (rnd.clientSeed) setClientSeed(rnd.clientSeed);
            if (rnd.nonce) setNonce(rnd.nonce);
            if (rnd.dropColumn != null) setDropColumn(rnd.dropColumn);
            setRoundId(rid);
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify() {
    if (!serverSeed || !clientSeed || !nonce) { setError("serverSeed, clientSeed, and nonce are required"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const params = new URLSearchParams({ serverSeed, clientSeed, nonce, dropColumn: String(dropColumn) });
      if (roundId) params.set("roundId", roundId);
      const res = await fetch(`/api/verify?${params}`);
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setResult(data); }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <main style={{ minHeight: "100vh", paddingTop: "1.5rem", paddingBottom: "3rem", paddingLeft: "1rem", paddingRight: "1rem", zIndex: 1, position: "relative" }}>
      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.2rem,3vw,1.7rem)", color: "var(--accent-cyan)", lineHeight: 1.1 }} className="text-glow-cyan">⚗️ ROUND VERIFIER</h1>
            <p style={{ fontFamily: "var(--font-body)", color: "rgba(255,255,255,0.42)", fontSize: "0.72rem", letterSpacing: "0.12em", marginTop: "3px" }}>INDEPENDENTLY VERIFY ANY PLINKO ROUND</p>
          </div>
          <Link href="/" className="glass-btn" style={{ padding: "0.5rem 1rem", textDecoration: "none", fontSize: "0.82rem" }}>← Back to Game</Link>
        </div>

        {/* How it works */}
        <div className="glass-card" style={{ padding: "1.2rem", marginBottom: "1.5rem" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>HOW PROVABLY FAIR WORKS</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
            <div style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>1. Commit</span><br/>
              Before your bet, server publishes <code style={{ color: "var(--accent-cyan)", fontSize: "0.72rem" }}>SHA256(serverSeed:nonce)</code>
            </div>
            <div style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>2. You add entropy</span><br/>
              Your <code style={{ color: "var(--accent-cyan)", fontSize: "0.72rem" }}>clientSeed</code> is mixed in — server can&apos;t predict your contribution
            </div>
            <div style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>3. Reveal</span><br/>
              After the round, <code style={{ color: "var(--accent-cyan)", fontSize: "0.72rem" }}>serverSeed</code> is revealed — you can verify all outcomes
            </div>
            <div style={{ padding: "0.75rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>4. Verify here</span><br/>
              Paste the seeds below — this page independently recomputes the outcome
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "1rem" }}>VERIFICATION INPUTS</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "0.3rem" }}>SERVER SEED (revealed)</label>
              <input className="glass-input" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} value={serverSeed} onChange={e => setServerSeed(e.target.value)} placeholder="b2a5f3f32a4d9c..." />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "0.3rem" }}>CLIENT SEED</label>
              <input className="glass-input" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} value={clientSeed} onChange={e => setClientSeed(e.target.value)} placeholder="candidate-hello" />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "0.3rem" }}>NONCE</label>
              <input className="glass-input" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} value={nonce} onChange={e => setNonce(e.target.value)} placeholder="42" />
            </div>
            <div>
              <label style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "0.3rem" }}>DROP COLUMN (0–12)</label>
              <input type="number" className="glass-input" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} value={dropColumn} onChange={e => setDropColumn(Math.max(0, Math.min(12, parseInt(e.target.value) || 0)))} min={0} max={12} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "0.3rem" }}>ROUND ID (optional — for cross-checking with DB)</label>
              <input className="glass-input" style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} value={roundId} onChange={e => setRoundId(e.target.value)} placeholder="e.g. f47ac10b-58cc-4372-a567-0e02b2c3d479" />
            </div>
          </div>
          {error && <p style={{ marginTop: "0.75rem", color: "var(--accent-red)", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>⚠ {error}</p>}
          <button
            className="glass-btn glass-btn-primary"
            style={{ marginTop: "1rem", width: "100%", padding: "0.9rem", fontSize: "0.95rem", letterSpacing: "0.08em" }}
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? "⏳ Verifying..." : "🔍 VERIFY ROUND"}
          </button>

          {/* Test vector prefill */}
          <button className="glass-btn" style={{ marginTop: "0.5rem", width: "100%", padding: "0.55rem", fontSize: "0.72rem" }}
            onClick={() => { setServerSeed("b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc"); setClientSeed("candidate-hello"); setNonce("42"); setDropColumn(6); setRoundId(""); }}>
            📋 Load test vector from spec
          </button>
        </div>

        {/* Results */}
        {result && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Derived values */}
            <div className="glass-card" style={{ padding: "1.25rem" }}>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "0.85rem" }}>DERIVED VALUES</p>
              <Field label="COMMIT HEX = SHA256(serverSeed:nonce)" value={result.commitHex} mono color="var(--accent-cyan)" />
              <Field label="COMBINED SEED = SHA256(serverSeed:clientSeed:nonce)" value={result.combinedSeed} mono color="var(--accent-purple)" />
              <Field label="PEG MAP HASH = SHA256(pegMap JSON)" value={result.pegMapHash} mono color="rgba(255,255,255,0.65)" />
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                <div style={{ padding: "0.75rem 1.25rem", background: `${BIN_COLORS[result.binIndex]}22`, border: `2px solid ${BIN_COLORS[result.binIndex]}80`, borderRadius: "10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: BIN_COLORS[result.binIndex] }}>{result.binIndex}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "rgba(255,255,255,0.5)" }}>BIN INDEX</div>
                </div>
                <div style={{ padding: "0.75rem 1.25rem", background: "rgba(245,197,24,0.1)", border: "1px solid rgba(245,197,24,0.35)", borderRadius: "10px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--accent-gold)" }}>{result.payoutMultiplier}×</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "rgba(255,255,255,0.5)" }}>MULTIPLIER</div>
                </div>
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.68rem", color: "rgba(255,255,255,0.42)", marginBottom: "0.25rem" }}>BALL PATH ({result.decisions.join("")})</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                  {result.decisions.map((d, i) => (
                    <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", padding: "1px 5px", borderRadius: "4px", background: d==="L"?"rgba(0,212,255,0.15)":"rgba(245,197,24,0.15)", color: d==="L"?"var(--accent-cyan)":"var(--accent-gold)", border: `1px solid ${d==="L"?"rgba(0,212,255,0.3)":"rgba(245,197,24,0.3)"}` }}>{d}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Match check */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {result.matches && (
                <div className="glass-card" style={{ padding: "1.25rem" }}>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "0.85rem" }}>MATCH vs STORED ROUND</p>
                  <div style={{ padding: "0.75rem", marginBottom: "0.75rem", background: result.matches.overall ? "rgba(0,255,136,0.1)" : "rgba(255,51,102,0.1)", border: `2px solid ${result.matches.overall ? "rgba(0,255,136,0.4)" : "rgba(255,51,102,0.4)"}`, borderRadius: "10px", textAlign: "center" }}>
                    <div style={{ fontSize: "2rem" }}>{result.matches.overall ? "✅" : "❌"}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "0.8rem", color: result.matches.overall ? "var(--accent-green)" : "var(--accent-red)", marginTop: "2px" }}>
                      {result.matches.overall ? "ROUND VERIFIED" : "MISMATCH DETECTED"}
                    </div>
                  </div>
                  <MatchRow label="commitHex" ok={result.matches.commitHex} />
                  <MatchRow label="combinedSeed" ok={result.matches.combinedSeed} />
                  <MatchRow label="pegMapHash" ok={result.matches.pegMapHash} />
                  <MatchRow label="binIndex" ok={result.matches.binIndex} />
                </div>
              )}

              {/* Path replay */}
              <div className="glass-card" style={{ padding: "1.25rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "rgba(255,255,255,0.42)", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>PATH REPLAY</p>
                <PathReplay decisions={result.decisions} binIndex={result.binIndex} />
              </div>

              {/* Peg map */}
              <div className="glass-card" style={{ padding: "1.25rem" }}>
                <button className="glass-btn" style={{ width: "100%", padding: "0.5rem", fontSize: "0.72rem" }} onClick={() => setShowPegMap(p => !p)}>
                  {showPegMap ? "▲ Hide" : "▼ Show"} Peg Map ({result.pegMap.length} rows)
                </button>
                {showPegMap && (
                  <div style={{ marginTop: "0.75rem", maxHeight: "240px", overflowY: "auto" }}>
                    {result.pegMap.map((row, r) => (
                      <div key={r} style={{ marginBottom: "4px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "rgba(255,255,255,0.35)" }}>Row {r}: </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "rgba(255,255,255,0.65)" }}>[{row.map(v => v.toFixed(6)).join(", ")}]</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ color: "white", padding: "2rem" }}>Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
