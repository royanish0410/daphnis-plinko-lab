import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";

export async function GET(
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
    // Parse pathJson if present
    if (round.pathJson && typeof round.pathJson === "string") {
      try {
        (round as Record<string, unknown>).pathJson = JSON.parse(round.pathJson as string);
      } catch {}
    }

    return NextResponse.json({ round });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
