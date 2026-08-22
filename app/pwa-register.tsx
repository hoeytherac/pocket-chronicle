"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    const clearOldCaches = () => {
      if (!("caches" in window)) return Promise.resolve([]);
      return caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("pocket-chronicle-")).map((key) => caches.delete(key))),
      );
    };

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(async (registration) => {
        await clearOldCaches();
        await registration.update();
      })
      .catch(() => undefined);
  }, []);

  return null;
}
