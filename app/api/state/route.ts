import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { playerAccountCharacters, playerAccounts, snapshots } from "@/db/schema";
import { isWorldActive } from "@/lib/bridge-presence";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function GET(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session) return jsonError("Pair this phone with a campaign to continue.", 401);
  const bridgeOnline = isWorldActive(session);

  const db = getDb();
  if (session.accountId) {
    const [account] = await db
      .select({ id: playerAccounts.id, playerLabel: playerAccounts.playerLabel })
      .from(playerAccounts)
      .where(and(eq(playerAccounts.id, session.accountId), eq(playerAccounts.active, true)))
      .limit(1);
    if (!account) return jsonError("That player account is no longer active in this campaign.", 401);

    const links = await db
      .select({ actorUuid: playerAccountCharacters.actorUuid })
      .from(playerAccountCharacters)
      .where(eq(playerAccountCharacters.accountId, account.id));
    if (links.length === 0) return jsonError("Your Foundry account does not currently own any characters.", 404);

    const actorUuids = links.map((link) => link.actorUuid);
    const rows = await db
      .select({ actorUuid: snapshots.actorUuid, payloadJson: snapshots.payloadJson, revision: snapshots.revision, updatedAt: snapshots.updatedAt })
      .from(snapshots)
      .where(and(eq(snapshots.campaignId, session.campaignId), inArray(snapshots.actorUuid, actorUuids)));
    if (rows.length === 0) return jsonError("Your account is connected, but Foundry has not sent its character updates yet.", 404);

    const requestedActor = new URL(request.url).searchParams.get("actorUuid");
    const selected = rows.find((row) => row.actorUuid === requestedActor) || rows[0];
    const parsed = rows.map((row) => ({ row, snapshot: JSON.parse(row.payloadJson) }));
    for (const item of parsed) item.snapshot.campaign.edition = session.edition;
    const selectedSnapshot = parsed.find((item) => item.row.actorUuid === selected.actorUuid)?.snapshot;

    return Response.json({
      snapshot: selectedSnapshot,
      revision: selected.revision,
      updatedAt: selected.updatedAt,
      account: { id: account.id, playerLabel: account.playerLabel },
      bridgeOnline,
      worldState: bridgeOnline ? "active" : "sleeping",
      characters: parsed.map(({ snapshot }) => ({
        uuid: snapshot.actor.uuid,
        name: snapshot.actor.name,
        portrait: snapshot.actor.portrait,
        ancestry: snapshot.actor.ancestry,
        classLabel: snapshot.actor.classLabel,
        level: snapshot.actor.level,
      })),
    });
  }

  const [snapshot] = await db
    .select({ payloadJson: snapshots.payloadJson, revision: snapshots.revision, updatedAt: snapshots.updatedAt })
    .from(snapshots)
    .where(and(eq(snapshots.campaignId, session.campaignId), eq(snapshots.actorUuid, session.actorUuid)))
    .limit(1);

  if (!snapshot) return jsonError("Your character is paired, but Foundry has not sent its first update yet.", 404);
  const payload = JSON.parse(snapshot.payloadJson);
  payload.campaign.edition = session.edition;
  return Response.json({ snapshot: payload, revision: snapshot.revision, updatedAt: snapshot.updatedAt, bridgeOnline, worldState: bridgeOnline ? "active" : "sleeping" });
}
