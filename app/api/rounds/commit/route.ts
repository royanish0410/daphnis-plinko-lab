import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb, initDb } from "@/lib/db";
import {
  generateServerSeed,
  generateNonce,
  makeCommit,
} from "@/lib/fairness";

export async function POST(_req: NextRequest) {
  try {
    await initDb();
    const db = getDb();

    const id = uuidv4();
    const serverSeed = generateServerSeed();
    const nonce = generateNonce();
    const commitHex = makeCommit(serverSeed, nonce);
    const createdAt = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO rounds (id, createdAt, status, nonce, commitHex, serverSeed, rows)
            VALUES (?, ?, 'CREATED', ?, ?, ?, ?)`,
      args: [id, createdAt, nonce, commitHex, serverSeed, 12],
    });

    return NextResponse.json({ roundId: id, commitHex, nonce });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
