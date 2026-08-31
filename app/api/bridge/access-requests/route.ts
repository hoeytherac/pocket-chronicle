import { readPendingAccessRequests } from "@/lib/bridge-queue";
import { jsonError, requireBridge } from "@/lib/server-auth";

export async function GET(request: Request) {
  const bridge = await requireBridge(request);
  if (!bridge) return jsonError("Bridge authentication failed.", 401);

  return Response.json({ requests: await readPendingAccessRequests(bridge.campaignId) });
}
