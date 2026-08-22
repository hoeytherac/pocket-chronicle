import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";

export async function GET() {
  const rows = await getDb()
    .select({ lastSeenAt: campaigns.lastSeenAt })
    .from(campaigns)
    .where(eq(campaigns.status, "active"));

  return Response.json({ connected: rows.some((campaign) => isBridgeOnline(campaign.lastSeenAt)) });
}
