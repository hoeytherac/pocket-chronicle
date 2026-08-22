import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { campaigns, tenants } from "@/db/schema";
import type { Edition } from "@/lib/protocol";
import { bearerToken, randomToken, sha256 } from "@/lib/security";
import { jsonError } from "@/lib/server-auth";

export async function POST(request: Request) {
  const expected = (env as unknown as { POCKET_BOOTSTRAP_TOKEN?: string }).POCKET_BOOTSTRAP_TOKEN;
  const supplied = bearerToken(request);
  if (!expected || !supplied || await sha256(expected) !== await sha256(supplied)) {
    return jsonError("Bootstrap authentication failed.", 401);
  }

  const body = await request.json().catch(() => null) as {
    tenantName?: string;
    tenantSlug?: string;
    campaignName?: string;
    campaignId?: string;
    edition?: Edition;
  } | null;
  if (!body?.tenantName || !body.tenantSlug || !body.campaignName || !body.campaignId) {
    return jsonError("Tenant name, slug, campaign name, and campaign ID are required.", 400);
  }

  const edition = body.edition === "commercial" ? "commercial" : "personal";
  const tenantId = crypto.randomUUID();
  const bridgeKey = randomToken(32);
  const now = Date.now();
  const db = getDb();

  try {
    await db.insert(tenants).values({
      id: tenantId,
      slug: body.tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60),
      name: body.tenantName.slice(0, 100),
      edition,
      subscriptionStatus: edition === "personal" ? "personal" : "trialing",
      createdAt: now,
    });
    await db.insert(campaigns).values({
      id: body.campaignId.slice(0, 100),
      tenantId,
      name: body.campaignName.slice(0, 100),
      bridgeKeyHash: await sha256(bridgeKey),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return jsonError("That tenant slug or campaign ID already exists.", 409);
  }

  return Response.json({
    tenantId,
    campaignId: body.campaignId,
    bridgeKey,
    edition,
    warning: "Save the bridge key now. It is never returned again.",
  }, { status: 201 });
}
