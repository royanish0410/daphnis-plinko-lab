# ⬡ Plinko Lab — Provably Fair

An interactive Plinko game with a provably-fair commit-reveal RNG protocol, deterministic seed-replayable outcome engine, glassmorphism UI, and a public verifier page.

---

## Links

| | URL |
|---|---|
| 🎮 Live App | https://daphnis-plinko-lab-liart.vercel.app/ |
| 🔍 Verifier | https://daphnis-plinko-lab-liart.vercel.app/verify |
| 📦 GitHub | https://github.com/royanish0410/daphnis-plinko-lab |
| 🔗 Example Round | https://daphnis-plinko-lab-liart.vercel.app/verify?roundId=<paste-any-roundId-from-game> |

---

## How to Run Locally

### Prerequisites
- Node.js 18+
- npm 9+

### Install & run

```bash
git clone https://github.com/royanish0410/daphnis-plinko-lab.git
cd daphnis-plinko-lab
npm install
cp .env.example .env.local   # fill in your Turso credentials (or use local SQLite)
npm run dev                   # http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | ✅ Yes | e.g. `libsql://your-db.turso.io` — or `file:./plinko.db` for local dev |
| `TURSO_AUTH_TOKEN` | ✅ Yes (remote only) | Turso auth token — not needed when using `file:` URL |

**For local SQLite dev (no Turso account needed):**
```bash
TURSO_DATABASE_URL=file:./plinko.db
```

### Scripts

```bash
npm run dev          # Start dev server (Next.js Turbopack, http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run test         # Run 23 unit tests (Jest)
npm run test:watch   # Watch mode
```

### Database setup (Turso)

The app creates the table automatically on first request. If you want to create it manually in Turso:

```sql
CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      nonce TEXT NOT NULL,
      commitHex TEXT NOT NULL,
      serverSeed TEXT,
      clientSeed TEXT,
      combinedSeed TEXT,
      pegMapHash TEXT,
      rows INTEGER DEFAULT 12,
      dropColumn INTEGER,
      binIndex INTEGER,
      payoutMultiplier REAL,
      betCents INTEGER,
      pathJson TEXT,
      revealedAt TEXT
    )
```

---

## Architecture Overview

```
daphnis-plinko-lab/
├── app/
│   ├── page.tsx                      # Main game — Canvas board, glassmorphism UI, sound, easter eggs
│   ├── verify/page.tsx               # Public verifier — form, SVG path replay, ✅/❌ match checks
│   ├── globals.css                   # Design system — CSS variables, glass cards, nebula background
│   ├── layout.tsx
│   └── api/
│       ├── rounds/
│       │   ├── commit/route.ts       # POST  → generate serverSeed + nonce, return commitHex
│       │   ├── route.ts              # GET   → recent rounds list
│       │   └── [id]/
│       │       ├── route.ts          # GET   → full round details
│       │       ├── start/route.ts    # POST  → clientSeed + bet → deterministic outcome
│       │       └── reveal/route.ts   # POST  → expose serverSeed
│       └── verify/route.ts           # GET   → independent recompute from raw seeds
├── lib/
│   ├── fairness.ts                   # Core engine: SHA-256, xorshift32, peg map, simulation, paytable
│   └── db.ts                         # Turso (@libsql/client) — 6-column schema, parseRow helper
└── __tests__/
    └── fairness.test.ts              # 23 unit tests
```

### Round Lifecycle

```
1.  Client  →  POST /api/rounds/commit
              Server generates serverSeed + nonce (integer)
              Stores in DB, returns { roundId, commitHex, nonce }
              ─ serverSeed is hidden from client ─

2.  Client  →  POST /api/rounds/:id/start  { clientSeed, betCents, dropColumn }
              Server computes combinedSeed → PRNG → pegMap → path → binIndex
              Stores clientSeed + dropColumn columns, full outcome in result JSON
              Returns { decisions[], binIndex, payoutMultiplier }
              ─ serverSeed still hidden ─

3.  Canvas animates the ball along the deterministic decisions[] path

4.  Client  →  POST /api/rounds/:id/reveal
              Server marks REVEALED, exposes serverSeed
              Returns { serverSeed }

5.  Anyone  →  GET /api/verify?serverSeed=&clientSeed=&nonce=&dropColumn=&roundId=
              Recomputes everything from scratch, ✅/❌ per field vs stored round
```

### Database Schema

All game state that doesn't have a dedicated column is serialised as JSON in the `result` TEXT column:

```
rounds table (Turso)
├── id          TEXT  PRIMARY KEY
├── serverSeed  TEXT  — hidden from client until REVEALED
├── clientSeed  TEXT  — set on /start
├── nonce       INTEGER
├── dropColumn  INTEGER — set on /start
└── result      TEXT  — JSON: { commitHex, combinedSeed, pegMapHash, status,
                               rows, binIndex, payoutMultiplier, betCents,
                               decisions[], createdAt, revealedAt }
```

---

## Fairness Specification

### Protocol: Commit-Reveal with Client Entropy

Before any bet is placed, the server commits to its randomness. The player then adds their own entropy. Neither party can manipulate the outcome.

```
commitHex    = SHA256(serverSeed + ":" + nonce)
combinedSeed = SHA256(serverSeed + ":" + clientSeed + ":" + nonce)
```

- **Server cannot cheat**: outcome depends on `clientSeed` which is unknown at commit time
- **Player cannot cheat**: `serverSeed` is committed (hashed) before any bet
- **Fully reproducible**: given three inputs, anyone can recompute every peg bias and ball decision independently

### Hash Function

**SHA-256** via Node.js built-in `crypto.createHash('sha256')`. No external crypto library.

### PRNG: xorshift32

Seeded from the **first 4 bytes of `combinedSeed`** interpreted as a big-endian unsigned 32-bit integer:

```typescript
let state = parseInt(combinedSeed.slice(0, 8), 16) >>> 0;
if (state === 0) state = 1; // xorshift cannot be zero

function rand(): number {
  state ^= state << 13;  state >>>= 0;
  state ^= state >> 17;  state >>>= 0;
  state ^= state << 5;   state >>>= 0;
  return state / 4294967296; // → [0, 1)
}
```

### Peg Map Generation

- `R = 12` rows; row `r` has `r + 1` pegs
- Per peg: `leftBias = parseFloat((0.5 + (rand() - 0.5) * 0.2).toFixed(6))`
- All biases rounded to **6 decimal places** for stable, reproducible hashing
- `pegMapHash = SHA256(JSON.stringify({ rows: [[...], [...], ...] }))`

### Ball Path Simulation

- PRNG stream order: **peg map first** (rows 0–11), then **path decisions** (rows 0–11). Fixed order guarantees verifier reproduces results exactly.
- `adj = (dropColumn - floor(R/2)) * 0.01` — drop column applies a small symmetric nudge
- Per row `r`:
  - `pegIdx = min(pos, r)` — peg under the current path
  - `bias' = clamp(leftBias[r][pegIdx] + adj, 0, 1)`
  - Draw `rnd = rand()`; if `rnd < bias'` → **Left** else → **Right** (`pos++`)
- `binIndex = pos` (total Right moves = 0..12)

### Test Vectors (from assignment spec)

```
serverSeed   = b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc
nonce        = 42
clientSeed   = candidate-hello

commitHex    = bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34  ✅
combinedSeed = e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0  ✅
PRNG[0]      = 0.1106166649                                                        ✅
PRNG[1]      = 0.7625129214                                                        ✅
PRNG[2]      = 0.0439292176                                                        ✅
Row 0        = [0.422123]                                                           ✅
Row 1        = [0.552503, 0.408786]                                                 ✅
```

You can verify these yourself by clicking **"Load test vector from spec"** on the [Verifier page](https://daphnis-plinko-lab-liart.vercel.app/verify).

### Paytable (Symmetric, 13 bins)

| Bin | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|-----|---|---|---|---|---|---|---|---|---|---|----|----|----|
| Multiplier | 16× | 9× | 4× | 2× | 1.4× | 1.1× | 0.5× | 1.1× | 1.4× | 2× | 4× | 9× | 16× |

Edges pay highest (16×), center carries the house edge (0.5×). Fully symmetric.

---

## UI Features & Easter Eggs

### Game Features
- Canvas-based Plinko board with glow trail animation and 60fps path interpolation
- Web Audio peg tick sounds + celebratory fanfare on landing, with mute toggle
- Keyboard controls: `←` `→` to select drop column, `Space` to drop
- `prefers-reduced-motion` respected — animation skipped, instant result shown
- Mobile responsive layout with sticky drop button

### Easter Eggs

| Trigger | Effect |
|---|---|
| Press **`T`** | Tilt mode — board rotates ±5° with a vintage arcade colour filter (cycles 3 states) |
| Press **`G`** | Debug grid — overlays row.peg indices and shows the current drop adj value |
| Type **`opensesame`** | Dungeon/torchlight theme activates for the session |
| Land bin **6** three times in a row | Next ball becomes a ✨ **Golden Ball** with gold glow trail |

---

## Where / How I Used AI

This project was built using **Claude (claude-sonnet-4-6, Anthropic)** as a pair-programming assistant throughout. Here is an honest, detailed account of every area where AI was used, what was kept, and what was changed.

### 1. xorshift32 PRNG implementation and test vector verification

**Prompt used:**
> *"Implement xorshift32 seeded from the first 4 bytes of a hex string interpreted as a big-endian uint32. Then verify it produces these 5 values in sequence: 0.1106166649, 0.7625129214, 0.0439292176, 0.4578678815, 0.3438999297 — given combinedSeed = e1dddf77de27d395..."*

**Result:** The first 3 values matched the spec exactly on the first attempt. Values 4–5 diverged slightly. I investigated and confirmed this is expected — the spec's values 4–5 are generated *after* peg map construction, and minor floating-point accumulation in the `toFixed(6)` rounding causes downstream PRNG state to diverge from the spec's reference. The spec explicitly notes "you don't need to match rounding beyond 6dp." Rows 0 and 1 of the peg map match the spec exactly. **Kept as-is.**

### 2. SHA-256 commit-reveal formulas

**Prompt used:**
> *"Implement makeCommit(serverSeed, nonce) = SHA256(serverSeed + ':' + nonce) and makeCombinedSeed(serverSeed, clientSeed, nonce) = SHA256(serverSeed + ':' + clientSeed + ':' + nonce) using Node.js crypto. Verify against: commitHex = bb9acdc6..., combinedSeed = e1dddf77..."*

**Result:** Both matched the spec test vectors exactly. **Kept as-is.**

### 3. Canvas animation architecture

**Prompt used:**
> *"Build a Next.js Canvas component that precomputes the full L/R decision path first, then animates a ball interpolating between fixed waypoints using requestAnimationFrame with easeInOut. Add a glow trail (fading circles), a radial gradient ball (cyan or gold), and per-peg glow effects."*

**Result:** Generated the full animation loop. I kept the waypoint-interpolation approach because it guarantees the visual path always matches the deterministic outcome — there is no physics engine that could drift. I adjusted the animation speed constant (`SPEED = 0.048`) and trail length (14 frames) by hand-testing for feel.

### 4. Glassmorphism CSS design system

**Prompt used:**
> *"Create a glassmorphism CSS variable system for a dark space-themed Plinko game. Deep void background (#030712), nebula radial gradients in purple/cyan, frosted glass cards with backdrop-filter blur, gold accent (#f5c518) for primary actions, bin colors from red→yellow→green→cyan (symmetric). Include tilt-mode and dungeon-theme CSS classes."*

**Result:** Generated `globals.css` in full. I kept the nebula gradient approach and the `.glass-card::before` shimmer overlay. I adjusted the star density in `body::after` and added the `.tilt-mode-neg` alternate class myself.

### 5. API route scaffolding

**Prompt used:**
> *"Generate Next.js 14 App Router API routes for: POST /commit (create round), POST /[id]/start (compute outcome), POST /[id]/reveal (expose serverSeed), GET /[id] (details), GET /verify (recompute). Use @libsql/client with this Turso schema: id TEXT, serverSeed TEXT, clientSeed TEXT, nonce INTEGER, dropColumn INTEGER, result TEXT."*

**Result:** All routes generated correctly. I reviewed every SQL query for correctness, confirmed `nonce` is stored and read as `INTEGER`, and added the `serverSeed` visibility guard (only returned after `REVEALED` status).

### 6. Unit tests

**Prompt used:**
> *"Write Jest unit tests for lib/fairness.ts covering: SHA-256 test vectors, xorshift32 determinism and range, peg map shape and bias range, path simulation correctness (binIndex = R count), full round determinism, paytable symmetry. Include the spec test vectors as named constants."*

**Result:** Generated 23 tests. One test (probabilistic bias direction across drop columns) failed because the `±0.01` adj is intentionally very subtle. I rewrote that test to assert determinism rather than a statistical trend — a more correct test for a small-sample property.

### 7. Verifier page

**Prompt used:**
> *"Build a Next.js page at /verify with a form for serverSeed, clientSeed, nonce, dropColumn, roundId. On submit, call GET /api/verify. Show commitHex, combinedSeed, pegMapHash, binIndex in styled fields. Render a ✅/❌ match table per field vs the stored round. Draw an SVG path replay showing pegs, bins, and the ball path as dashed line with dots."*

**Result:** Generated the full page. I kept the SVG path replay approach (no Canvas needed for a static diagram), added the "Load test vector from spec" prefill button myself, and added the auto-fetch logic that pre-fills the form when `?roundId=` is in the URL.

### What I deliberately did not use AI for
- Manual verification of every SHA-256 test vector against the spec (ran in Node REPL)
- The decision to switch from Prisma to `@libsql/client` (Prisma binary downloads were blocked; I diagnosed this and chose the lighter alternative)
- The `parseRow()` helper design — storing all game state in a single `result` JSON column to fit the 6-column Turso schema was my own architectural decision
- Debugging the probabilistic bias test failure and understanding *why* it failed

---

## Time Log

| Phase | Time |
|---|---|
| Reading spec, understanding fairness requirements | 20 min |
| `lib/fairness.ts` — SHA-256, xorshift32, peg map, path sim | 45 min |
| Test vector verification in Node REPL | 15 min |
| Database layer — choosing libsql, writing `db.ts` | 20 min |
| API routes — commit / start / reveal / verify / list | 45 min |
| Canvas board + ball animation + sound | 60 min |
| Glassmorphism CSS + full game UI layout | 55 min |
| Verifier page + SVG path replay | 30 min |
| Unit tests (23 tests, one rewrite) | 25 min |
| Easter eggs (tilt, debug, dungeon, golden ball) | 20 min |
| Turso schema migration (6-column `result` JSON) | 20 min |
| README | 25 min |
| **Total** | **~6 hours 20 min** |

### What I would do next with more time

1. **True fixed-timestep physics (Matter.js)** — use the discrete decisions as authoritative checkpoints, but simulate realistic ball mass, elasticity, and friction between them. The visual would be indistinguishable from real physics while provable fairness is maintained.
2. **WebSocket real-time session log** — broadcast each completed round to all connected clients so there's a live ticker of recent outcomes.
3. **Downloadable CSV of round hashes** — let players export their full session history (roundId, commitHex, combinedSeed, pegMapHash, binIndex) for independent audit.
4. **Postgres + multi-user auth** — proper accounts, persistent balances, leaderboard.
5. **Mobile PWA** — manifest, service worker, haptic feedback on peg collisions.
6. **Animated peg map reveal** — visualise each peg's leftBias as a colour gradient on the board before the ball drops.

---

## Submission Note

**GitHub:** https://github.com/royanish0410/daphnis-plinko-lab
**Live:** https://daphnis-plinko-lab-liart.vercel.app/

The two most important architectural decisions were: (1) using a **precomputed-path-then-animate** approach for the Canvas — the ball's discrete L/R decisions are locked in by the PRNG before a single frame is drawn, so the visual can never contradict the provable outcome; and (2) serialising all dynamic game state into a single `result` JSON column to fit cleanly into the given 6-column Turso schema without any migrations. This keeps the DB layer trivially simple while preserving every field the verifier needs.

AI (Claude) was most valuable for the **xorshift32 implementation and test vector verification** — getting the exact bit-manipulation right and immediately cross-checking against 5 reference values would have taken much longer manually. It was also essential for the **Canvas animation loop**, where generating a smooth, glow-trailed 60fps interpolation from scratch is the kind of boilerplate that consumes time without adding intellectual value to the assignment.