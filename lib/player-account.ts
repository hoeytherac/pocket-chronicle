import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { playerAccountCharacters, playerSessions } from "@/db/schema";
import { randomToken, sessionCookie, sha256 } from "@/lib/security";

export const PLAYER_SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function createPlayerAccountSession(accountId: string, campaignId: string) {
  const db = getDb();
  const [character] = await db
    .select({ actorUuid: playerAccountCharacters.actorUuid })
    .from(playerAccountCharacters)
    .where(eq(playerAccountCharacters.accountId, accountId))
    .limit(1);

  if (!character) return null;
  const now = Date.now();
  const token = randomToken();
  await db.insert(playerSessions).values({
    id: crypto.randomUUID(),
    campaignId,
    actorUuid: character.actorUuid,
    accountId,
    tokenHash: await sha256(token),
    createdAt: now,
    expiresAt: now + PLAYER_SESSION_SECONDS * 1000,
  });

  return {
    token,
    cookie: sessionCookie(token, PLAYER_SESSION_SECONDS),
  };
}
