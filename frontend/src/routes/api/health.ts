/**
 * GET /api/health
 *
 * Server-side health probe for the local model.
 * The browser hits this instead of the model directly (no CORS issue).
 * Returns 200 if the model server is reachable, 502 otherwise.
 */
import { createAPIFileRoute } from "@tanstack/react-start/api";

const MODEL_URL =
  process.env.MODEL_API_URL?.trim() ||
  "http://localhost:8000/v1/chat/completions";

const MODEL_TOKEN = process.env.MODEL_API_TOKEN?.trim() || "";

function baseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

export const APIRoute = createAPIFileRoute("/api/health")({
  GET: async () => {
    const base = baseUrl(MODEL_URL);
    const headers: Record<string, string> = {};
    if (MODEL_TOKEN) headers["Authorization"] = `Bearer ${MODEL_TOKEN}`;

    const candidates = [`${base}/v1/models`, `${base}/health`];

    for (const url of candidates) {
      try {
        const r = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(4000) });
        if (r.ok) {
          return new Response(JSON.stringify({ status: "online", probed: url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        /* try next */
      }
    }

    return new Response(JSON.stringify({ status: "offline" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  },
});
