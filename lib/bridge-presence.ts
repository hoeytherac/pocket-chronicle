export const BRIDGE_ONLINE_WINDOW_MS = 30_000;

export function isBridgeOnline(lastSeenAt: number | null | undefined, now = Date.now()) {
  return typeof lastSeenAt === "number" && now - lastSeenAt <= BRIDGE_ONLINE_WINDOW_MS;
}
