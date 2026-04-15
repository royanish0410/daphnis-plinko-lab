# ⬡ Plinko Lab — Provably Fair

A full-stack interactive Plinko game with a provably-fair commit-reveal RNG protocol, deterministic seed-replayable outcome engine, glassmorphism UI, and an independent verifier page.

---

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run start
npm run test
```

No environment variables needed for local dev — uses SQLite at `./plinko.db`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./plinko.db` | SQLite DB path |

---

## Architecture

```
app/
  page.tsx                  # Main game (Canvas + glassmorphism)
  verify/page.tsx           # Public verifier
  api/
    rounds/commit/          # POST → create round + commitHex
    rounds/[id]/start/      # POST → clientSeed + bet → outcome
    rounds/[id]/reveal/     # POST → reveal serverSeed
    rounds/[id]/            # GET → full round details
    rounds/                 # GET → recent rounds list
    verify/                 # GET → deterministic recompute
lib/
  fairness.ts               # SHA-256, xorshift32, peg map, simulation, paytable
  db.ts                     # SQLite via @libsql/client
__tests__/
  fairness.test.ts          # 23 unit tests
```

### Round lifecycle

```
POST /commit  →  roundId + commitHex (serverSeed hidden)
POST /start   →  decisions[] + binIndex (serverSeed still hidden)
              ↓ canvas animates path
POST /reveal  →  serverSeed exposed
GET  /verify  →  independent recompute, ✅/❌ per field
```

---

## Fairness Specification

### Commit-Reveal Protocol

```
commitHex    = SHA256(serverSeed + ":" + nonce)          # published before round
combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
```

### PRNG: xorshift32

Seeded from **first 4 bytes (big-endian uint32)** of `combinedSeed`:

```typescript
let state = parseInt(combinedSeed.slice(0, 8), 16) >>> 0;
// state=0 → set 1 (degenerate case)
function rand() {
  state ^= state << 13; state >>>= 0;
  state ^= state >> 17; state >>>= 0;
  state ^= state << 5;  state >>>= 0;
  return state / 4294967296;
}
```

### Peg Map

- R=12 rows; row `r` has `r+1` pegs
- `leftBias = parseFloat((0.5 + (rand() - 0.5) * 0.2).toFixed(6))`
- `pegMapHash = SHA256(JSON.stringify({ rows: [...] }))`

### Ball Path

- `adj = (dropColumn - 6) * 0.01`
- Per row: `bias' = clamp(leftBias + adj, 0, 1)`; if `rand() < bias'` → L else → R
- `binIndex = count of R moves`

### Test Vectors (from spec)

```
serverSeed   = b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc
nonce        = 42
clientSeed   = candidate-hello

commitHex    = bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34  ✅
combinedSeed = e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0  ✅
PRNG[0..2]   = 0.1106166649, 0.7625129214, 0.0439292176                          ✅
Row 0        = [0.422123]                                                          ✅
Row 1        = [0.552503, 0.408786]                                                ✅
```

### Paytable (Symmetric, 13 bins)

| Bin | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|-----|---|---|---|---|---|---|---|---|---|---|----|----|----|
| × | 16 | 9 | 4 | 2 | 1.4 | 1.1 | 0.5 | 1.1 | 1.4 | 2 | 4 | 9 | 16 |

---

## Easter Eggs

| Trigger | Effect |
|---|---|
| **T** | Tilt — board rotates ±5° with vintage arcade filter |
| **G** | Debug grid — shows row.peg indices + adj value |
| Type `opensesame` | Dungeon/torchlight theme for the session |
| 3× center bin (6) in a row | Next ball → ✨ Golden Ball |

---

**Where AI helped most:**

1. **xorshift32 + test vector verification** — Prompted to implement the PRNG and immediately verify against the 5 spec values. First 3 matched exactly on first attempt. Rows 0–1 of the peg map match the spec exactly.

2. **Canvas animation** — Described the "precompute discrete path first, interpolate visuals between waypoints" architecture. Claude generated the full `requestAnimationFrame` loop with trail, glow, and peg collision effects.

3. **Glassmorphism CSS system** — Described the deep-space aesthetic (nebula gradients, frosted glass, gold/cyan accents); Claude generated the complete CSS variable system and component classes.

4. **API boilerplate** — Route scaffolding, TypeScript types, schema design.

**What I changed/verified:**
- Confirmed every cryptographic formula matches spec manually
- Fixed the probabilistic bias test (adj=±0.01 per row is intentionally subtle; rewrote as a determinism check instead)
- Switched Prisma → `@libsql/client` after binary downloads failed in the build sandbox
- Verified `commitHex` and `combinedSeed` against spec test vectors

**Key prompts:**
- *"Implement xorshift32 seeded from first 4 bytes big-endian of a hex string, verify against: [0.1106..., 0.7625..., 0.0439...]"*
- *"Build a Canvas component animating a ball along a precomputed L/R decisions array with glow trail"*
- *"Write 23 Jest unit tests proving the full fairness pipeline is deterministic and matches spec test vectors"*

---

## Time Log

| Phase | ~Time |
|---|---|
| Spec reading + architecture planning | 20 min |
| `lib/fairness.ts` + test vector verification | 45 min |
| Database layer + API routes | 60 min |
| Canvas board + animation | 60 min |
| Glassmorphism CSS + game UI | 60 min |
| Verifier page + SVG path replay | 30 min |
| Unit tests (23) | 25 min |
| Easter eggs | 20 min |
| README | 20 min |
| **Total** | **~6 hours** |

**What I'd do next:**
- True Matter.js physics (discrete decisions stay authoritative)
- WebSocket real-time session log
- Downloadable CSV of round hashes
- Postgres + multi-user balances
- Mobile PWA with haptic feedback
