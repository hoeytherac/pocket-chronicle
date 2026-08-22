import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actions } from "@/db/schema";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { ok?: boolean; result?: unknown; error?: string };
  const result = await getDb()
    .update(actions)
    .set({
      status: body.ok === false ? "failed" : "completed",
      resultJson: JSON.stringify(body.ok === false ? { error: body.error || "Foundry rejected the action." } : body.result || {}),
      completedAt: Date.now(),
    })
    .where(and(eq(actions.id, id), eq(actions.campaignId, bridge.campaignId)));

  return Response.json({ ok: true, changed: result.meta.changes });
}
