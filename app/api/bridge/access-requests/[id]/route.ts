import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { phoneAccessRequests } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { decision?: "approve" | "deny" } | null;
  if (!body || !["approve", "deny"].includes(body.decision || "")) return jsonError("Choose approve or deny.", 400);

  const status = body.decision === "approve" ? "approved" : "denied";
  const result = await getDb().update(phoneAccessRequests).set({ status, decidedAt: Date.now() }).where(and(
    eq(phoneAccessRequests.id, id),
    eq(phoneAccessRequests.campaignId, bridge.campaignId),
    eq(phoneAccessRequests.status, "pending"),
    gt(phoneAccessRequests.expiresAt, Date.now()),
  ));
  if (!result.meta.changes) return jsonError("That phone request is no longer waiting for approval.", 409);
  return Response.json({ ok: true, status });
}
