import { getDb } from "@/db";
import { actions } from "@/db/schema";
import { allowedActionKinds, type ChronicleActionKind } from "@/lib/protocol";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function POST(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session) return jsonError("Your phone is not paired with this campaign.", 401);

  const body = await request.json().catch(() => null) as { kind?: ChronicleActionKind; payload?: Record<string, unknown> } | null;
  if (!body?.kind || !allowedActionKinds.has(body.kind)) return jsonError("That action is not supported.", 400);

  const now = Date.now();
  const id = crypto.randomUUID();
  await getDb().insert(actions).values({
    id,
    tenantId: session.tenantId,
    campaignId: session.campaignId,
    actorUuid: session.actorUuid,
    sessionId: session.sessionId,
    kind: body.kind,
    payloadJson: JSON.stringify(body.payload || {}),
    status: "pending",
    createdAt: now,
  });

  return Response.json({ ok: true, id, status: "pending" }, { status: 202 });
}
