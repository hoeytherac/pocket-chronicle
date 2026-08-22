import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import type { ChronicleSnapshot } from "@/lib/protocol";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const snapshot = await request.json().catch(() => null) as ChronicleSnapshot | null;
  if (!snapshot?.actor?.uuid || !snapshot.campaign) return jsonError("The snapshot is missing its campaign or character.", 400);
  if (snapshot.campaign.id !== bridge.campaignId) return jsonError("The snapshot belongs to a different campaign.", 403);

  const now = Date.now();
  const db = getDb();
  const [existing] = await db
    .select({ id: snapshots.id, revision: snapshots.revision })
    .from(snapshots)
    .where(and(eq(snapshots.campaignId, bridge.campaignId), eq(snapshots.actorUuid, snapshot.actor.uuid)))
    .limit(1);

  const revision = (existing?.revision || 0) + 1;
  const payloadJson = JSON.stringify({ ...snapshot, revision, generatedAt: now });
  if (existing) {
    await db.update(snapshots).set({ revision, payloadJson, updatedAt: now }).where(eq(snapshots.id, existing.id));
  } else {
    await db.insert(snapshots).values({
      id: crypto.randomUUID(),
      tenantId: bridge.tenantId,
      campaignId: bridge.campaignId,
      actorUuid: snapshot.actor.uuid,
      revision,
      payloadJson,
      updatedAt: now,
    });
  }

  // Lets D1 update query-planning statistics without a separate maintenance job.
  await db.run(sql`PRAGMA optimize`);
  return Response.json({ ok: true, revision });
}
