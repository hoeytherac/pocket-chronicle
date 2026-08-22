import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { phoneAccessRequests, playerAccountCharacters, playerAccounts } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { authenticateCampaignAccess } from "@/lib/campaign-access";
import { jsonError } from "@/lib/server-auth";
import { randomToken, sha256 } from "@/lib/security";

const REQUEST_LIFETIME_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    campaignId?: string;
    campaignCode?: string;
    accountId?: string;
  } | null;
  if (!body?.campaignId || !body.campaignCode || !body.accountId) return jsonError("Choose your Foundry player account.", 400);

  const campaign = await authenticateCampaignAccess(body.campaignId, body.campaignCode);
  if (!campaign) return jsonError("That Campaign ID or Campaign code is incorrect.", 401);
  if (!isBridgeOnline(campaign.lastSeenAt)) return jsonError("That Foundry world is offline.", 503);

  const db = getDb();
  const [account] = await db
    .select({ id: playerAccounts.id, playerLabel: playerAccounts.playerLabel, actorUuid: playerAccountCharacters.actorUuid })
    .from(playerAccounts)
    .innerJoin(playerAccountCharacters, eq(playerAccountCharacters.accountId, playerAccounts.id))
    .where(and(
      eq(playerAccounts.id, body.accountId),
      eq(playerAccounts.campaignId, campaign.id),
      eq(playerAccounts.active, true),
    ))
    .limit(1);
  if (!account) return jsonError("That Foundry player account is unavailable.", 404);

  const requestToken = randomToken();
  const now = Date.now();
  const requestId = crypto.randomUUID();
  await db.insert(phoneAccessRequests).values({
    id: requestId,
    campaignId: campaign.id,
    accountId: account.id,
    requestTokenHash: await sha256(requestToken),
    status: "pending",
    createdAt: now,
    expiresAt: now + REQUEST_LIFETIME_MS,
  });

  return Response.json({
    requestId,
    requestToken,
    playerLabel: account.playerLabel,
    campaignName: campaign.name,
    expiresInSeconds: REQUEST_LIFETIME_MS / 1000,
  });
}
