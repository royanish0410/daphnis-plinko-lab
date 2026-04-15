import { createClient } from "@libsql/client";
import path from "path";

const dbPath =
  process.env.DATABASE_URL || `file:${path.join(process.cwd(), "plinko.db")}`;

let client: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!client) {
    client = createClient({ url: dbPath });
  }
  return client;
}

export async function initDb() {
  const db = getDb();
  await db.execute(`
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
  `);
}

export interface Round {
  id: string;
  createdAt: string;
  status: string;
  nonce: string;
  commitHex: string;
  serverSeed?: string | null;
  clientSeed?: string | null;
  combinedSeed?: string | null;
  pegMapHash?: string | null;
  rows: number;
  dropColumn?: number | null;
  binIndex?: number | null;
  payoutMultiplier?: number | null;
  betCents?: number | null;
  pathJson?: string | null;
  revealedAt?: string | null;
}
