import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { ACTIVE_WORLD_LEASE_MS } from "@/lib/bridge-presence";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);
  const body = await request.json().catch(() => null) as { active?: boolean } | null;
  if (typeof body?.active !== "boolean") return jsonError("Choose whether the world should be active or sleeping.", 400);

  const now = Date.now();
  const activeUntil = body.active ? now + ACTIVE_WORLD_LEASE_MS : null;
  await getDb().update(campaigns).set({
    worldState: body.active ? "active" : "sleeping",
    activeUntil,
    lastSeenAt: body.active ? now : null,
    updatedAt: now,
  }).where(eq(campaigns.id, bridge.campaignId));

  return Response.json({
    ok: true,
    worldState: body.active ? "active" : "sleeping",
    activeUntil,
  });
}
