import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actions } from "@/db/schema";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requirePlayerSession(request);
  if (!session) return jsonError("Your phone is not paired with this campaign.", 401);

  const { id } = await context.params;
  const [action] = await getDb()
    .select({
      status: actions.status,
      resultJson: actions.resultJson,
      createdAt: actions.createdAt,
      completedAt: actions.completedAt,
    })
    .from(actions)
    .where(and(
      eq(actions.id, id),
      eq(actions.campaignId, session.campaignId),
      eq(actions.sessionId, session.sessionId),
    ))
    .limit(1);

  if (!action) return jsonError("That phone action was not found.", 404);
  return Response.json({
    status: action.status,
    result: action.resultJson ? JSON.parse(action.resultJson) : null,
    createdAt: action.createdAt,
    completedAt: action.completedAt,
  });
}
