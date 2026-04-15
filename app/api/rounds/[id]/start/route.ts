import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { computeRound, PAYTABLE } from "@/lib/fairness";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const db = getDb();
    const { id } = await params;

    const body = await req.json();
    const { clientSeed, betCents, dropColumn } = body;

    if (!clientSeed || typeof clientSeed !== "string") {
      return NextResponse.json(
        { error: "clientSeed is required" },
        { status: 400 }
      );
    }
    if (typeof dropColumn !== "number" || dropColumn < 0 || dropColumn > 12) {
      return NextResponse.json(
        { error: "dropColumn must be 0-12" },
        { status: 400 }
      );
    }
    if (typeof betCents !== "number" || betCents <= 0) {
      return NextResponse.json(
        { error: "betCents must be positive" },
        { status: 400 }
      );
    }

    // Fetch round
    const result = await db.execute({
      sql: `SELECT * FROM rounds WHERE id = ?`,
      args: [id],
    });
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    const round = result.rows[0];
    if (round.status !== "CREATED") {
      return NextResponse.json(
        { error: "Round already started" },
        { status: 409 }
      );
    }

    const serverSeed = round.serverSeed as string;
    const nonce = round.nonce as string;
    const R = (round.rows as number) || 12;

    // Compute deterministic outcome
    const { combinedSeed, pegMapHash, decisions, binIndex } = computeRound(
      serverSeed,
      clientSeed,
      nonce,
      dropColumn,
      R
    );

    const payoutMultiplier = PAYTABLE[binIndex] || 1;
    const pathJson = JSON.stringify(decisions);
    const now = new Date().toISOString();

    await db.execute({
      sql: `UPDATE rounds SET
              status = 'STARTED',
              clientSeed = ?,
              combinedSeed = ?,
              pegMapHash = ?,
              dropColumn = ?,
              binIndex = ?,
              payoutMultiplier = ?,
              betCents = ?,
              pathJson = ?,
              createdAt = COALESCE(createdAt, ?)
            WHERE id = ?`,
      args: [
        clientSeed,
        combinedSeed,
        pegMapHash,
        dropColumn,
        binIndex,
        payoutMultiplier,
        betCents,
        pathJson,
        now,
        id,
      ],
    });

    return NextResponse.json({
      roundId: id,
      pegMapHash,
      rows: R,
      binIndex,
      decisions,
      payoutMultiplier,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
