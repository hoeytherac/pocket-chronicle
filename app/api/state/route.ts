import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function GET(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session) return jsonError("Pair this phone with a campaign to continue.", 401);
  if (!isBridgeOnline(session.lastSeenAt)) return jsonError("The Foundry module is offline.", 503);

  const db = getDb();
  const [snapshot] = await db
    .select({ payloadJson: snapshots.payloadJson, revision: snapshots.revision, updatedAt: snapshots.updatedAt })
    .from(snapshots)
    .where(and(eq(snapshots.campaignId, session.campaignId), eq(snapshots.actorUuid, session.actorUuid)))
    .limit(1);

  if (!snapshot) return jsonError("Your character is paired, but Foundry has not sent its first update yet.", 404);
  const payload = JSON.parse(snapshot.payloadJson);
  payload.campaign.edition = session.edition;
  return Response.json({ snapshot: payload, revision: snapshot.revision, updatedAt: snapshot.updatedAt });
}
