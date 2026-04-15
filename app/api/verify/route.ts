import { NextRequest, NextResponse } from "next/server";
import {
  makeCommit,
  makeCombinedSeed,
  makeXorshift32,
  generatePegMap,
  hashPegMap,
  simulatePath,
  PAYTABLE,
} from "@/lib/fairness";
import { getDb, initDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serverSeed = searchParams.get("serverSeed") || "";
    const clientSeed = searchParams.get("clientSeed") || "";
    const nonce = searchParams.get("nonce") || "";
    const dropColumn = parseInt(searchParams.get("dropColumn") || "6");
    const roundId = searchParams.get("roundId") || "";

    if (!serverSeed || !clientSeed || !nonce) {
      return NextResponse.json(
        { error: "serverSeed, clientSeed, nonce required" },
        { status: 400 }
      );
    }

    const R = 12;
    const commitHex = makeCommit(serverSeed, nonce);
    const combinedSeed = makeCombinedSeed(serverSeed, clientSeed, nonce);
    const rand = makeXorshift32(combinedSeed);
    const pegMap = generatePegMap(rand, R);
    const pegMapHash = hashPegMap(pegMap);
    const { decisions, binIndex } = simulatePath(rand, pegMap, dropColumn, R);
    const payoutMultiplier = PAYTABLE[binIndex] || 1;

    let storedRound = null;
    let matches = null;

    if (roundId) {
      await initDb();
      const db = getDb();
      const result = await db.execute({
        sql: `SELECT * FROM rounds WHERE id = ?`,
        args: [roundId],
      });
      if (result.rows.length > 0) {
        storedRound = result.rows[0];
        matches = {
          commitHex: storedRound.commitHex === commitHex,
          combinedSeed: storedRound.combinedSeed === combinedSeed,
          pegMapHash: storedRound.pegMapHash === pegMapHash,
          binIndex: storedRound.binIndex === binIndex,
          overall:
            storedRound.commitHex === commitHex &&
            storedRound.combinedSeed === combinedSeed &&
            storedRound.pegMapHash === pegMapHash &&
            storedRound.binIndex === binIndex,
        };
      }
    }

    return NextResponse.json({
      commitHex,
      combinedSeed,
      pegMapHash,
      binIndex,
      decisions,
      payoutMultiplier,
      pegMap: pegMap.rows,
      matches,
      storedRound: storedRound
        ? {
            id: storedRound.id,
            commitHex: storedRound.commitHex,
            combinedSeed: storedRound.combinedSeed,
            pegMapHash: storedRound.pegMapHash,
            binIndex: storedRound.binIndex,
            dropColumn: storedRound.dropColumn,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
