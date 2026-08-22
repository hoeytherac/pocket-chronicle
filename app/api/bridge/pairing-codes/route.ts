import { getDb } from "@/db";
import { pairingCodes } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";
import { randomPairingCode, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const body = await request.json().catch(() => null) as { actorUuid?: string; playerLabel?: string } | null;
  if (!body?.actorUuid || !body.playerLabel) return jsonError("Choose a character and player name.", 400);

  const code = randomPairingCode();
  const now = Date.now();
  await getDb().insert(pairingCodes).values({
    id: crypto.randomUUID(),
    campaignId: bridge.campaignId,
    codeHash: await sha256(code),
    actorUuid: body.actorUuid,
    playerLabel: body.playerLabel.slice(0, 80),
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
  });

  return Response.json({ code, expiresInSeconds: 600 });
}
