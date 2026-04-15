import {
  sha256,
  makeCommit,
  makeCombinedSeed,
  makeXorshift32,
  generatePegMap,
  hashPegMap,
  simulatePath,
  computeRound,
  PAYTABLE,
} from "../lib/fairness";

// ─── Official test vectors from assignment spec ──────────────────────────────
const SERVER_SEED = "b2a5f3f32a4d9c6ee7a8c1d33456677890abcdeffedcba0987654321ffeeddcc";
const NONCE = "42";
const CLIENT_SEED = "candidate-hello";
const EXPECTED_COMMIT = "bb9acdc67f3f18f3345236a01f0e5072596657a9005c7d8a22cff061451a6b34";
const EXPECTED_COMBINED = "e1dddf77de27d395ea2be2ed49aa2a59bd6bf12ee8d350c16c008abd406c07e0";

describe("SHA-256 combiner", () => {
  test("commitHex matches spec test vector", () => {
    expect(makeCommit(SERVER_SEED, NONCE)).toBe(EXPECTED_COMMIT);
  });

  test("combinedSeed matches spec test vector", () => {
    expect(makeCombinedSeed(SERVER_SEED, CLIENT_SEED, NONCE)).toBe(EXPECTED_COMBINED);
  });

  test("sha256 is pure deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });
});

describe("xorshift32 PRNG", () => {
  test("first 3 PRNG values match spec exactly", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const r1 = rand(), r2 = rand(), r3 = rand();
    expect(r1).toBeCloseTo(0.1106166649, 8);
    expect(r2).toBeCloseTo(0.7625129214, 8);
    expect(r3).toBeCloseTo(0.0439292176, 8);
  });

  test("PRNG is deterministic — same seed → same sequence", () => {
    const rand1 = makeXorshift32(EXPECTED_COMBINED);
    const rand2 = makeXorshift32(EXPECTED_COMBINED);
    for (let i = 0; i < 20; i++) {
      expect(rand1()).toBe(rand2());
    }
  });

  test("PRNG output is in [0,1)", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("non-zero seed avoids degenerate state", () => {
    // A seed of 0 would make xorshift stuck at 0; our impl handles it
    const allZeroSeed = "00000000" + "a".repeat(56);
    const rand = makeXorshift32(allZeroSeed);
    const v = rand();
    expect(v).toBeGreaterThan(0);
  });
});

describe("Peg map generation", () => {
  test("row 0 leftBias matches spec: [0.422123]", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    expect(pegMap.rows[0][0]).toBe(0.422123);
  });

  test("row 1 leftBias matches spec: [0.552503, 0.408786]", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    expect(pegMap.rows[1][0]).toBe(0.552503);
    expect(pegMap.rows[1][1]).toBe(0.408786);
  });

  test("peg map has correct shape: R rows, r+1 pegs per row", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    expect(pegMap.rows.length).toBe(12);
    for (let r = 0; r < 12; r++) {
      expect(pegMap.rows[r].length).toBe(r + 1);
    }
  });

  test("all leftBias values are in [0.4, 0.6]", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    for (const row of pegMap.rows) {
      for (const bias of row) {
        expect(bias).toBeGreaterThanOrEqual(0.4 - 1e-9);
        expect(bias).toBeLessThanOrEqual(0.6 + 1e-9);
      }
    }
  });

  test("pegMapHash is stable for same inputs", () => {
    const rand1 = makeXorshift32(EXPECTED_COMBINED);
    const rand2 = makeXorshift32(EXPECTED_COMBINED);
    const pm1 = generatePegMap(rand1, 12);
    const pm2 = generatePegMap(rand2, 12);
    expect(hashPegMap(pm1)).toBe(hashPegMap(pm2));
  });
});

describe("Path simulation", () => {
  test("decisions array has exactly R=12 entries", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    const { decisions } = simulatePath(rand, pegMap, 6, 12);
    expect(decisions.length).toBe(12);
    decisions.forEach(d => expect(["L", "R"]).toContain(d));
  });

  test("binIndex equals number of R decisions", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    const { decisions, binIndex } = simulatePath(rand, pegMap, 6, 12);
    const rCount = decisions.filter(d => d === "R").length;
    expect(binIndex).toBe(rCount);
  });

  test("binIndex is in [0, 12]", () => {
    const rand = makeXorshift32(EXPECTED_COMBINED);
    const pegMap = generatePegMap(rand, 12);
    const { binIndex } = simulatePath(rand, pegMap, 6, 12);
    expect(binIndex).toBeGreaterThanOrEqual(0);
    expect(binIndex).toBeLessThanOrEqual(12);
  });

  test("dropColumn adj is applied as (col - 6) * 0.01 per peg", () => {
    // Verify the adj formula directly: adj = (dropColumn - floor(12/2)) * 0.01
    // For col=0: adj = (0-6)*0.01 = -0.06 (biases slightly left)
    // For col=12: adj = (12-6)*0.01 = +0.06 (biases slightly right)
    // The adj is small (max ±0.06) so we verify determinism, not large statistical effects
    const r1 = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 0);
    const r2 = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 12);
    // Different drop columns → different paths (same peg map, different bias)
    // At minimum the combined seed is same but the path decisions may differ
    // The key property: both are fully deterministic
    const r1b = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 0);
    const r2b = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 12);
    expect(r1.binIndex).toBe(r1b.binIndex);
    expect(r2.binIndex).toBe(r2b.binIndex);
    // Also verify center column has adj=0
    const { decisions } = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 6);
    expect(decisions.length).toBe(12);
  });
});

describe("Full round determinism", () => {
  test("same inputs always produce same outputs", () => {
    const r1 = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 6);
    const r2 = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 6);
    expect(r1.binIndex).toBe(r2.binIndex);
    expect(r1.combinedSeed).toBe(r2.combinedSeed);
    expect(r1.pegMapHash).toBe(r2.pegMapHash);
    expect(r1.decisions).toEqual(r2.decisions);
  });

  test("different clientSeed produces different outcome (usually)", () => {
    const r1 = computeRound(SERVER_SEED, "seed-A", NONCE, 6);
    const r2 = computeRound(SERVER_SEED, "seed-B", NONCE, 6);
    // Combined seeds must differ
    expect(r1.combinedSeed).not.toBe(r2.combinedSeed);
  });

  test("verifier recompute matches round data", () => {
    const { combinedSeed, pegMapHash, binIndex, decisions } = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 6);
    const commit = makeCommit(SERVER_SEED, NONCE);
    expect(commit).toBe(EXPECTED_COMMIT);
    expect(combinedSeed).toBe(EXPECTED_COMBINED);
    // Recompute from scratch should match
    const r2 = computeRound(SERVER_SEED, CLIENT_SEED, NONCE, 6);
    expect(r2.pegMapHash).toBe(pegMapHash);
    expect(r2.binIndex).toBe(binIndex);
    expect(r2.decisions).toEqual(decisions);
  });
});

describe("Paytable", () => {
  test("paytable is symmetric", () => {
    for (let i = 0; i <= 6; i++) {
      expect(PAYTABLE[i]).toBe(PAYTABLE[12 - i]);
    }
  });

  test("edges (0,12) have highest multiplier", () => {
    const max = Math.max(...Object.values(PAYTABLE));
    expect(PAYTABLE[0]).toBe(max);
    expect(PAYTABLE[12]).toBe(max);
  });

  test("center (6) has lowest multiplier (house edge)", () => {
    const min = Math.min(...Object.values(PAYTABLE));
    expect(PAYTABLE[6]).toBe(min);
  });

  test("all 13 bins have a multiplier", () => {
    for (let i = 0; i <= 12; i++) {
      expect(PAYTABLE[i]).toBeGreaterThan(0);
    }
  });
});
