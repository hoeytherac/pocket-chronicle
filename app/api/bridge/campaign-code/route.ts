import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";
import { hashPassword, verifyPassword } from "@/lib/security";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);
  const body = await request.json().catch(() => null) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return jsonError("Campaign code must be exactly six letters or numbers.", 400);
  }

  const db = getDb();
  const [campaign] = await db.select({ pairingPasswordHash: campaigns.pairingPasswordHash })
    .from(campaigns).where(eq(campaigns.id, bridge.campaignId)).limit(1);
  if (campaign?.pairingPasswordHash && await verifyPassword(code, campaign.pairingPasswordHash)) {
    return Response.json({ ok: true, changed: false });
  }
  await db.update(campaigns).set({ pairingPasswordHash: await hashPassword(code), updatedAt: Date.now() })
    .where(eq(campaigns.id, bridge.campaignId));
  return Response.json({ ok: true, changed: true });
}
