// Browsers throttle background Foundry tabs. Allow brief sleep without
// declaring the bridge dead while still preventing stale phone actions.
export const BRIDGE_ONLINE_WINDOW_MS = 120_000;

export function isBridgeOnline(lastSeenAt: number | null | undefined, now = Date.now()) {
  return typeof lastSeenAt === "number" && now - lastSeenAt <= BRIDGE_ONLINE_WINDOW_MS;
}
