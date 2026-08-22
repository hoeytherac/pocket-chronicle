import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actions, playerAccountCharacters } from "@/db/schema";
import { allowedActionKinds, type ChronicleActionKind } from "@/lib/protocol";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function POST(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session) return jsonError("Your phone is not paired with this campaign.", 401);
  if (!isBridgeOnline(session.lastSeenAt)) return jsonError("The Foundry module is offline.", 503);

  const body = await request.json().catch(() => null) as { actorUuid?: string; kind?: ChronicleActionKind; payload?: Record<string, unknown> } | null;
  if (!body?.kind || !allowedActionKinds.has(body.kind)) return jsonError("That action is not supported.", 400);

  let actorUuid = session.actorUuid;
  if (session.accountId) {
    if (!body.actorUuid) return jsonError("Choose one of your characters first.", 400);
    const [owned] = await getDb()
      .select({ actorUuid: playerAccountCharacters.actorUuid })
      .from(playerAccountCharacters)
      .where(and(
        eq(playerAccountCharacters.accountId, session.accountId),
        eq(playerAccountCharacters.actorUuid, body.actorUuid),
      ))
      .limit(1);
    if (!owned) return jsonError("That character does not belong to this Foundry account.", 403);
    actorUuid = owned.actorUuid;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  await getDb().insert(actions).values({
    id,
    tenantId: session.tenantId,
    campaignId: session.campaignId,
    actorUuid,
    sessionId: session.sessionId,
    kind: body.kind,
    payloadJson: JSON.stringify(body.payload || {}),
    status: "pending",
    createdAt: now,
  });

  return Response.json({ ok: true, id, status: "pending" }, { status: 202 });
}
