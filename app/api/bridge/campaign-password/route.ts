import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";
import { hashPassword, verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || body.password.length < 8 || body.password.length > 128) {
    return jsonError("Campaign password must contain between 8 and 128 characters.", 400);
  }

  const db = getDb();
  const [campaign] = await db.select({ pairingPasswordHash: campaigns.pairingPasswordHash })
    .from(campaigns).where(eq(campaigns.id, bridge.campaignId)).limit(1);
  if (campaign?.pairingPasswordHash && await verifyPassword(body.password, campaign.pairingPasswordHash)) {
    return Response.json({ ok: true, changed: false });
  }
  await db.update(campaigns).set({ pairingPasswordHash: await hashPassword(body.password), updatedAt: Date.now() })
    .where(eq(campaigns.id, bridge.campaignId));
  return Response.json({ ok: true, changed: true });
}
