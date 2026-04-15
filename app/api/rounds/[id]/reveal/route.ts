import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const db = getDb();
    const { id } = await params;

    const result = await db.execute({
      sql: `SELECT * FROM rounds WHERE id = ?`,
      args: [id],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    const round = result.rows[0];
    if (round.status === "REVEALED") {
      return NextResponse.json({
        serverSeed: round.serverSeed,
        alreadyRevealed: true,
      });
    }
    if (round.status !== "STARTED") {
      return NextResponse.json(
        { error: "Round not started yet" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    await db.execute({
      sql: `UPDATE rounds SET status = 'REVEALED', revealedAt = ? WHERE id = ?`,
      args: [now, id],
    });

    return NextResponse.json({ serverSeed: round.serverSeed });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
