import { createHash, randomBytes } from "crypto";

// ─── SHA-256 ────────────────────────────────────────────────────────────────
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─── Random server seed ──────────────────────────────────────────────────────
export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

export function generateNonce(): string {
  return Math.floor(Math.random() * 1_000_000).toString();
}

// ─── Commit ─────────────────────────────────────────────────────────────────
export function makeCommit(serverSeed: string, nonce: string): string {
  return sha256(`${serverSeed}:${nonce}`);
}

// ─── Combined seed ───────────────────────────────────────────────────────────
export function makeCombinedSeed(
  serverSeed: string,
  clientSeed: string,
  nonce: string
): string {
  return sha256(`${serverSeed}:${clientSeed}:${nonce}`);
}

// ─── xorshift32 PRNG ─────────────────────────────────────────────────────────
// Seeded from first 4 bytes of combinedSeed (big-endian uint32)
export function makeXorshift32(combinedSeed: string): () => number {
  // Parse first 8 hex chars as big-endian uint32
  let state = parseInt(combinedSeed.slice(0, 8), 16) >>> 0;
  if (state === 0) state = 1; // xorshift cannot be 0

  return function rand(): number {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state >>>= 0;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296; // divide by 2^32 → [0, 1)
  };
}

// ─── Peg map ─────────────────────────────────────────────────────────────────
export interface PegMap {
  rows: Array<number[]>; // rows[r][p] = leftBias
}

export function generatePegMap(rand: () => number, R: number): PegMap {
  const rows: Array<number[]> = [];
  for (let r = 0; r < R; r++) {
    const pegs: number[] = [];
    for (let p = 0; p <= r; p++) {
      const raw = 0.5 + (rand() - 0.5) * 0.2;
      pegs.push(parseFloat(raw.toFixed(6)));
    }
    rows.push(pegs);
  }
  return { rows };
}

export function hashPegMap(pegMap: PegMap): string {
  return sha256(JSON.stringify(pegMap));
}

// ─── Deterministic path ───────────────────────────────────────────────────────
export interface PathResult {
  decisions: Array<"L" | "R">; // per row
  binIndex: number;
}

export function simulatePath(
  rand: () => number,
  pegMap: PegMap,
  dropColumn: number,
  R: number
): PathResult {
  const floorR2 = Math.floor(R / 2);
  const adj = (dropColumn - floorR2) * 0.01;

  let pos = 0;
  const decisions: Array<"L" | "R"> = [];

  for (let r = 0; r < R; r++) {
    const pegIdx = Math.min(pos, r);
    const leftBias = pegMap.rows[r][pegIdx];
    const biasAdj = Math.min(1, Math.max(0, leftBias + adj));
    const rnd = rand();
    if (rnd < biasAdj) {
      decisions.push("L");
    } else {
      decisions.push("R");
      pos += 1;
    }
  }

  return { decisions, binIndex: pos };
}

// ─── Full round computation ───────────────────────────────────────────────────
export function computeRound(
  serverSeed: string,
  clientSeed: string,
  nonce: string,
  dropColumn: number,
  R = 12
) {
  const combinedSeed = makeCombinedSeed(serverSeed, clientSeed, nonce);
  const rand = makeXorshift32(combinedSeed);
  const pegMap = generatePegMap(rand, R);
  const pegMapHash = hashPegMap(pegMap);
  const { decisions, binIndex } = simulatePath(rand, pegMap, dropColumn, R);
  return { combinedSeed, pegMap, pegMapHash, decisions, binIndex };
}

// ─── Paytable ─────────────────────────────────────────────────────────────────
// Symmetric for 13 bins (0..12), edges highest
export const PAYTABLE: Record<number, number> = {
  0: 16,
  1: 9,
  2: 4,
  3: 2,
  4: 1.4,
  5: 1.1,
  6: 0.5, // center (house edge)
  7: 1.1,
  8: 1.4,
  9: 2,
  10: 4,
  11: 9,
  12: 16,
};
