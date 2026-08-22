/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const BRIDGE_METHODS = "GET, POST, OPTIONS";
const BRIDGE_HEADERS = "authorization, content-type, x-pocket-campaign";

function allowedBridgeOrigin(request: Request) {
  const value = request.headers.get("origin");
  if (!value) return null;
  try {
    const origin = new URL(value);
    if (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
      return origin.origin;
    }
  } catch {
    return null;
  }
  return null;
}

function bridgeCorsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": BRIDGE_METHODS,
    "access-control-allow-headers": BRIDGE_HEADERS,
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function withBridgeCors(response: Response, origin: string | null) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(bridgeCorsHeaders(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isBridgeRequest = url.pathname.startsWith("/api/bridge/");
    const bridgeOrigin = isBridgeRequest ? allowedBridgeOrigin(request) : null;

    if (isBridgeRequest && request.method === "OPTIONS") {
      if (!bridgeOrigin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: bridgeCorsHeaders(bridgeOrigin) });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return withBridgeCors(await handler.fetch(request, env, ctx), bridgeOrigin);
  },
};

export default worker;
