import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const result = await db.execute({
      sql: `SELECT id, createdAt, status, commitHex, nonce, clientSeed, combinedSeed,
                   pegMapHash, rows, dropColumn, binIndex, payoutMultiplier, betCents, revealedAt
            FROM rounds ORDER BY createdAt DESC LIMIT ?`,
      args: [limit],
    });

    return NextResponse.json({ rounds: result.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
