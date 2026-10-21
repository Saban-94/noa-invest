import { createFileRoute } from "@tanstack/react-router";
import { HttpError, assertAuthorized, splitScan } from "@/server/scan-split.server";

// Vercel Functions cap request/response bodies at ~4.5MB, so keep the
// source scan under ~2MB (the response carries every split page as base64).
const MAX_BASE64_CHARS = 4_000_000;

export const Route = createFileRoute("/api/split-scan")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          assertAuthorized(request);

          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new HttpError(400, "invalid JSON body");
          }

          const pdfBase64 =
            body && typeof body === "object"
              ? (body as { pdfBase64?: unknown }).pdfBase64
              : undefined;
          if (typeof pdfBase64 !== "string" || pdfBase64.length === 0) {
            throw new HttpError(400, "pdfBase64 is required");
          }
          if (pdfBase64.length > MAX_BASE64_CHARS) {
            throw new HttpError(413, "scan is too large for a single request");
          }

          const result = await splitScan(pdfBase64);
          return Response.json(result);
        } catch (err) {
          if (err instanceof HttpError) {
            return Response.json({ error: err.message }, { status: err.status });
          }
          console.error("split-scan failed", err instanceof Error ? err.message : err);
          return Response.json({ error: "internal error" }, { status: 500 });
        }
      },
    },
  },
});
