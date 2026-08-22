import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";
import { hashPassword } from "@/lib/security";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const body = await request.json().catch(() => ({})) as { campaignCode?: string };
  const campaignCode = body.campaignCode?.trim().toUpperCase() || "";
  const campaignCodeReady = /^[A-Z0-9]{6}$/.test(campaignCode);
  const now = Date.now();
  await getDb()
    .update(campaigns)
    .set({
      lastSeenAt: now,
      updatedAt: now,
      ...(campaignCodeReady ? { pairingPasswordHash: await hashPassword(campaignCode) } : {}),
    })
    .where(eq(campaigns.id, bridge.campaignId));

  return Response.json({ connected: true, campaignId: bridge.campaignId, campaignCodeReady, checkedAt: now });
}
