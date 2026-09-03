/**
 * src/routes/api/chat.ts
 *
 * Server-side streaming proxy for the local model.
 *
 * Why this exists:
 *   - Browsers block cross-origin fetches unless the target server sends
 *     CORS headers. Local model servers (llama.cpp, vLLM, Ollama) rarely do.
 *   - This route runs on the server — same-origin to the browser, no CORS.
 *   - The API token never reaches the browser; it lives in process.env.
 *
 * Environment variables (set in .env or your deployment dashboard):
 *   MODEL_API_URL     — e.g. http://localhost:8000/v1/chat/completions
 *   MODEL_API_TOKEN   — Bearer token for the model server (optional)
 *   MODEL_NAME        — default model string if client doesn't specify
 *
 * The client sends the same OpenAI-compatible body it always did —
 * this proxy forwards it verbatim and streams the response back.
 */

import { createAPIFileRoute } from "@tanstack/react-start/api";

const MODEL_URL =
  process.env.MODEL_API_URL?.trim() ||
  "http://localhost:8000/v1/chat/completions";

const MODEL_TOKEN = process.env.MODEL_API_TOKEN?.trim() || "";

export const APIRoute = createAPIFileRoute("/api/chat")({
  POST: async ({ request }) => {
    // ── 1. Parse the incoming body ──────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── 2. Forward to the model server ──────────────────────────────────
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };

    if (MODEL_TOKEN) {
      headers["Authorization"] = `Bearer ${MODEL_TOKEN}`;
    }

    let modelResp: Response;
    try {
      modelResp = await fetch(MODEL_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        // @ts-expect-error — Node 18+ fetch supports duplex
        duplex: "half",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: `Cannot reach model server: ${msg}` }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!modelResp.ok) {
      const text = await modelResp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Model server returned ${modelResp.status}`,
          detail: text.slice(0, 500),
        }),
        {
          status: modelResp.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ── 3. Stream the response straight back to the client ──────────────
    // Forward the model's SSE stream without buffering.
    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Allow the browser to read this from JS (same-origin so not strictly
      // needed, but explicit is safer)
      "X-Accel-Buffering": "no",
    };

    return new Response(modelResp.body, {
      status: 200,
      headers: responseHeaders,
    });
  },
});
