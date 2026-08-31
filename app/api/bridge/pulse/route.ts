import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { ACTIVE_WORLD_LEASE_MS } from "@/lib/bridge-presence";
import { claimPendingActions, readPendingAccessRequests } from "@/lib/bridge-queue";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);
  if (bridge.worldState !== "active") return jsonError("This Pocket Chronicle world is sleeping.", 409);

  const now = Date.now();
  const activeUntil = now + ACTIVE_WORLD_LEASE_MS;
  await getDb()
    .update(campaigns)
    .set({ lastSeenAt: now, activeUntil, updatedAt: now })
    .where(eq(campaigns.id, bridge.campaignId));

  const [queuedActions, pendingRequests] = await Promise.all([
    claimPendingActions(bridge.campaignId),
    readPendingAccessRequests(bridge.campaignId),
  ]);

  return Response.json({
    connected: true,
    worldState: "active",
    campaignId: bridge.campaignId,
    checkedAt: now,
    activeUntil,
    actions: queuedActions,
    requests: pendingRequests,
  });
}
