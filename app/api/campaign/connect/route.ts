import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, playerAccountCharacters, playerAccounts } from "@/db/schema";
import { isBridgeOnline } from "@/lib/bridge-presence";
import { authenticateCampaignAccess } from "@/lib/campaign-access";
import { jsonError } from "@/lib/server-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { campaignId?: string; campaignCode?: string } | null;
  if (!body?.campaignId || !body.campaignCode) return jsonError("Enter the Campaign ID and permanent six-character Campaign code from your GM.", 400);

  const normalizedCampaignId = body.campaignId.trim().slice(0, 100);
  const [codeState] = await getDb().select({ pairingPasswordHash: campaigns.pairingPasswordHash })
    .from(campaigns).where(eq(campaigns.id, normalizedCampaignId)).limit(1);
  if (codeState && !codeState.pairingPasswordHash) {
    return jsonError("Your GM's Campaign code has not been saved yet. Ask the GM to open Pocket Chronicle Bridge settings and click Save Campaign Code.", 409);
  }

  const campaign = await authenticateCampaignAccess(normalizedCampaignId, body.campaignCode);
  if (!campaign) return jsonError("That Campaign ID or Campaign code is incorrect.", 401);
  if (!isBridgeOnline(campaign.lastSeenAt)) return jsonError("That Foundry world is offline. Ask the GM to open it and enable Pocket Chronicle.", 503);

  const rows = await getDb()
    .select({
      id: playerAccounts.id,
      playerLabel: playerAccounts.playerLabel,
      actorUuid: playerAccountCharacters.actorUuid,
    })
    .from(playerAccounts)
    .innerJoin(playerAccountCharacters, eq(playerAccountCharacters.accountId, playerAccounts.id))
    .where(and(eq(playerAccounts.campaignId, campaign.id), eq(playerAccounts.active, true)));

  const accounts = Array.from(rows.reduce((entries, row) => {
    const current = entries.get(row.id) || { id: row.id, playerLabel: row.playerLabel, characterCount: 0 };
    current.characterCount += 1;
    entries.set(row.id, current);
    return entries;
  }, new Map<string, { id: string; playerLabel: string; characterCount: number }>()).values())
    .sort((left, right) => left.playerLabel.localeCompare(right.playerLabel));

  if (accounts.length === 0) return jsonError("No Foundry player accounts own a character yet. Ask the GM to assign Owner permission.", 409);
  return Response.json({ campaign: { id: campaign.id, name: campaign.name }, accounts });
}
