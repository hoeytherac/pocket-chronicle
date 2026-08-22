import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { phoneAccessRequests, playerAccounts } from "@/db/schema";
import { jsonError } from "@/lib/server-auth";
import { sha256 } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { requestToken?: string } | null;
  if (!body?.requestToken) return jsonError("That phone approval request is unavailable.", 401);

  const [accessRequest] = await getDb()
    .select({
      status: phoneAccessRequests.status,
      expiresAt: phoneAccessRequests.expiresAt,
      playerLabel: playerAccounts.playerLabel,
      needsPasswordSetup: playerAccounts.credentialHash,
    })
    .from(phoneAccessRequests)
    .innerJoin(playerAccounts, eq(phoneAccessRequests.accountId, playerAccounts.id))
    .where(and(eq(phoneAccessRequests.id, id), eq(phoneAccessRequests.requestTokenHash, await sha256(body.requestToken))))
    .limit(1);
  if (!accessRequest) return jsonError("That phone approval request is unavailable.", 404);
  if (accessRequest.expiresAt <= Date.now()) return Response.json({ status: "expired" });

  return Response.json({
    status: accessRequest.status,
    playerLabel: accessRequest.playerLabel,
    needsPasswordSetup: !accessRequest.needsPasswordSetup,
  });
}
