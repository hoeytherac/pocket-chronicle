import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { pairingCodes, playerSessions } from "@/db/schema";
import { jsonError } from "@/lib/server-auth";
import { randomToken, sessionCookie, sha256 } from "@/lib/security";

const SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { code?: string } | null;
  const code = body?.code?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!code || code.length !== 6) return jsonError("Enter the six-character pairing code from your GM.", 400);

  const db = getDb();
  const codeHash = await sha256(code);
  const [pairing] = await db
    .select()
    .from(pairingCodes)
    .where(and(eq(pairingCodes.codeHash, codeHash), gt(pairingCodes.expiresAt, Date.now()), isNull(pairingCodes.consumedAt)))
    .limit(1);

  if (!pairing) return jsonError("That pairing code is invalid or has expired.", 404);

  const now = Date.now();
  const token = randomToken();
  const sessionId = crypto.randomUUID();
  await db.insert(playerSessions).values({
    id: sessionId,
    campaignId: pairing.campaignId,
    actorUuid: pairing.actorUuid,
    tokenHash: await sha256(token),
    createdAt: now,
    expiresAt: now + SESSION_SECONDS * 1000,
  });
  await db.update(pairingCodes).set({ consumedAt: now }).where(eq(pairingCodes.id, pairing.id));

  return Response.json(
    { ok: true, playerLabel: pairing.playerLabel },
    { headers: { "set-cookie": sessionCookie(token, SESSION_SECONDS) } },
  );
}
