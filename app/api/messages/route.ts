import { and, desc, eq, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { chronicleMessages, playerAccounts } from "@/db/schema";
import { jsonError, requirePlayerSession } from "@/lib/server-auth";

export async function GET(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session?.accountId) return jsonError("Sign in with a Foundry player account to use Pocket Chat.", 401);
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") === "dm" ? "dm" : "group";
  const recipientAccountId = String(url.searchParams.get("recipient") || "");
  const db = getDb();
  const contacts = await db.select({ id: playerAccounts.id, label: playerAccounts.playerLabel })
    .from(playerAccounts)
    .where(and(
      eq(playerAccounts.campaignId, session.campaignId),
      eq(playerAccounts.active, true),
      ne(playerAccounts.id, session.accountId),
    ));

  const recipient = channel === "dm" && recipientAccountId
    ? contacts.find((account) => account.id === recipientAccountId)
    : null;
  const visibility = channel === "group"
    ? and(eq(chronicleMessages.campaignId, session.campaignId), eq(chronicleMessages.channel, "group"))
    : recipient
      ? and(
        eq(chronicleMessages.campaignId, session.campaignId),
        eq(chronicleMessages.channel, "dm"),
        or(
          and(
            eq(chronicleMessages.senderAccountId, session.accountId),
            eq(chronicleMessages.recipientAccountId, recipient.id),
          ),
          and(
            eq(chronicleMessages.senderAccountId, recipient.id),
            eq(chronicleMessages.recipientAccountId, session.accountId),
          ),
        ),
      )
      : null;
  const rows = visibility
    ? await db.select({
      id: chronicleMessages.id,
      channel: chronicleMessages.channel,
      author: chronicleMessages.authorLabel,
      content: chronicleMessages.content,
      createdAt: chronicleMessages.createdAt,
      senderAccountId: chronicleMessages.senderAccountId,
      recipientAccountId: chronicleMessages.recipientAccountId,
    }).from(chronicleMessages).where(visibility).orderBy(desc(chronicleMessages.createdAt)).limit(60)
    : [];

  return Response.json({
    channel,
    recipientAccountId: recipient?.id || null,
    contacts,
    messages: rows.reverse().map((message) => ({
      id: message.id,
      channel: message.channel,
      author: message.author,
      content: message.content,
      timestamp: message.createdAt,
      senderAccountId: message.senderAccountId,
      recipientAccountId: message.recipientAccountId,
      mine: message.senderAccountId === session.accountId,
    })),
  });
}

export async function POST(request: Request) {
  const session = await requirePlayerSession(request);
  if (!session?.accountId) return jsonError("Sign in with a Foundry player account to use Pocket Chat.", 401);
  const body = await request.json().catch(() => null) as { channel?: string; content?: string; recipientAccountId?: string } | null;
  const channel = body?.channel === "dm" ? "dm" : body?.channel === "group" ? "group" : null;
  const content = String(body?.content || "").trim().slice(0, 2000);
  if (!channel || !content) return jsonError("Write a message and choose Party or a player.", 400);

  const db = getDb();
  const [account] = await db.select({ playerLabel: playerAccounts.playerLabel })
    .from(playerAccounts)
    .where(and(eq(playerAccounts.id, session.accountId), eq(playerAccounts.active, true)))
    .limit(1);
  if (!account) return jsonError("That Pocket Chronicle player account is unavailable.", 403);

  const recipientAccountId = channel === "dm" ? String(body?.recipientAccountId || "") : "";
  if (channel === "dm") {
    const [recipient] = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(and(
      eq(playerAccounts.id, recipientAccountId),
      eq(playerAccounts.campaignId, session.campaignId),
      eq(playerAccounts.active, true),
      ne(playerAccounts.id, session.accountId),
    )).limit(1);
    if (!recipient) return jsonError("Choose another player for this private message.", 400);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(chronicleMessages).values({
    id,
    campaignId: session.campaignId,
    senderAccountId: session.accountId,
    recipientAccountId: channel === "dm" ? recipientAccountId : null,
    channel,
    authorLabel: account.playerLabel,
    content,
    createdAt: now,
  });
  return Response.json({
    ok: true,
    message: {
      id,
      channel,
      author: account.playerLabel,
      content,
      timestamp: now,
      senderAccountId: session.accountId,
      recipientAccountId: channel === "dm" ? recipientAccountId : null,
      mine: true,
    },
  });
}
