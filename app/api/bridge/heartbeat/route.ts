import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const now = Date.now();
  await getDb()
    .update(campaigns)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(eq(campaigns.id, bridge.campaignId));

  return Response.json({ connected: true, campaignId: bridge.campaignId, checkedAt: now });
}
