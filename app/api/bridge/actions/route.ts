import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actions, playerAccounts, playerSessions } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function GET(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const db = getDb();
  const pending = await db
    .select({
      id: actions.id,
      actorUuid: actions.actorUuid,
      kind: actions.kind,
      payloadJson: actions.payloadJson,
      createdAt: actions.createdAt,
      requestedByFoundryUserId: playerAccounts.foundryUserId,
    })
    .from(actions)
    .leftJoin(playerSessions, eq(actions.sessionId, playerSessions.id))
    .leftJoin(playerAccounts, eq(playerSessions.accountId, playerAccounts.id))
    .where(and(eq(actions.campaignId, bridge.campaignId), eq(actions.status, "pending")))
    .orderBy(asc(actions.createdAt))
    .limit(20);
  const queue = pending;

  for (const action of queue) {
    await db.update(actions).set({ status: "claimed" }).where(eq(actions.id, action.id));
  }

  return Response.json({
    actions: queue.map((action) => ({
      id: action.id,
      actorUuid: action.actorUuid,
      kind: action.kind,
      payload: JSON.parse(action.payloadJson),
      createdAt: action.createdAt,
      requestedByFoundryUserId: action.requestedByFoundryUserId || undefined,
    })),
  });
}
