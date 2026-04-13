import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const allowedModes = new Set(["balanced", "visual_only", "strict_reject"]);
const MAX_JSON_BYTES = 20 * 1024;
const MAX_REPORTS_PER_HOST_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const allowedOrigins = [
  /^chrome-extension:\/\/[a-z]{32}$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i
];

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const corsHeaders = buildCorsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({
      ok: false,
      error: "Only POST requests are allowed."
    }, 405, corsHeaders);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse({
      ok: false,
      error: "Content-Type must be application/json."
    }, 415, corsHeaders);
  }

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({
      ok: false,
      error: "Origin is not allowed."
    }, 403, corsHeaders);
  }

  const expectedPublicKey = (Deno.env.get("COOKIELESS_REPORT_PUBLIC_KEY") || "").trim();
  const providedPublicKey = (request.headers.get("apikey") || "").trim();

  if (expectedPublicKey && providedPublicKey !== expectedPublicKey) {
    return jsonResponse({
      ok: false,
      error: "Cookieless report key mismatch."
    }, 401, corsHeaders);
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return jsonResponse({
      ok: false,
      error: "Request body is required."
    }, 400, corsHeaders);
  }

  if (new TextEncoder().encode(rawBody).length > MAX_JSON_BYTES) {
    return jsonResponse({
      ok: false,
      error: "Request payload is too large."
    }, 413, corsHeaders);
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody);
  } catch (_error) {
    return jsonResponse({
      ok: false,
      error: "Request body must be valid JSON."
    }, 400, corsHeaders);
  }

  const normalized = normalizePayload(payload);

  if (!normalized.ok) {
    return jsonResponse({
      ok: false,
      error: normalized.error
    }, 400, corsHeaders);
  }

  const rateLimitSince = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: rateLimitCount, error: rateLimitError } = await supabaseAdmin
    .from("bug_reports")
    .select("id", { count: "exact", head: true })
    .eq("hostname", normalized.value.hostname)
    .gte("created_at", rateLimitSince);

  if (rateLimitError) {
    return jsonResponse({
      ok: false,
      error: "Cookieless could not apply report rate limiting."
    }, 500, corsHeaders);
  }

  if (Number(rateLimitCount || 0) >= MAX_REPORTS_PER_HOST_WINDOW) {
    return jsonResponse({
      ok: false,
      error: "Too many recent reports for this site. Please try again later."
    }, 429, corsHeaders);
  }

  const duplicateSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentMatches, error: duplicateError } = await supabaseAdmin
    .from("bug_reports")
    .select("id")
    .eq("hostname", normalized.value.hostname)
    .eq("url", normalized.value.url)
    .eq("mode", normalized.value.mode)
    .eq("outcome_label", normalized.value.outcomeLabel)
    .eq("detected_banner", normalized.value.detectedBanner)
    .gte("created_at", duplicateSince)
    .order("created_at", { ascending: false })
    .limit(1);

  if (duplicateError) {
    return jsonResponse({
      ok: false,
      error: "Cookieless could not check for duplicate reports."
    }, 500, corsHeaders);
  }

  const duplicate = Array.isArray(recentMatches) ? recentMatches[0] : null;
  if (duplicate?.id) {
    return jsonResponse({
      ok: true,
      deduped: true,
      reportId: duplicate.id
    }, 200, corsHeaders);
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("bug_reports")
    .insert({
      hostname: normalized.value.hostname,
      url: normalized.value.url,
      mode: normalized.value.mode,
      outcome_label: normalized.value.outcomeLabel,
      detected_banner: normalized.value.detectedBanner,
      extension_version: normalized.value.extensionVersion,
      browser_version: normalized.value.browserVersion,
      report_text: normalized.value.reportText
    })
    .select("id")
    .single();

  if (insertError) {
    return jsonResponse({
      ok: false,
      error: "Cookieless could not store this report."
    }, 500, corsHeaders);
  }

  return jsonResponse({
    ok: true,
    deduped: false,
    reportId: inserted?.id || ""
  }, 200, corsHeaders);
});

function buildCorsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cookieless-client, x-cookieless-extension-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "null",
    "Content-Type": "application/json",
    Vary: "Origin"
  };
}

function isAllowedOrigin(origin: string) {
  if (!origin) {
    return false;
  }

  return allowedOrigins.some((pattern) => pattern.test(origin));
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

function normalizePayload(payload: Record<string, unknown>) {
  const hostname = sanitizeText(payload.hostname, 255);
  const url = sanitizeText(payload.url, 2048);
  const mode = sanitizeText(payload.mode, 32);
  const outcomeLabel = sanitizeText(payload.outcomeLabel, 120);
  const detectedBanner = sanitizeText(payload.detectedBanner, 240);
  const extensionVersion = sanitizeText(payload.extensionVersion, 40);
  const browserVersion = sanitizeText(payload.browserVersion, 512);
  const reportText = sanitizeText(payload.reportText, 16000);
  const submittedAt = sanitizeText(payload.submittedAt, 64);

  if (!hostname) {
    return { ok: false, error: "hostname is required." };
  }

  if (!url) {
    return { ok: false, error: "url is required." };
  }

  if (!isHttpUrl(url)) {
    return { ok: false, error: "url must be an http(s) URL." };
  }

  if (!allowedModes.has(mode)) {
    return { ok: false, error: "mode is invalid." };
  }

  if (!outcomeLabel) {
    return { ok: false, error: "outcomeLabel is required." };
  }

  if (!detectedBanner) {
    return { ok: false, error: "detectedBanner is required." };
  }

  if (!extensionVersion) {
    return { ok: false, error: "extensionVersion is required." };
  }

  if (!browserVersion) {
    return { ok: false, error: "browserVersion is required." };
  }

  if (!reportText) {
    return { ok: false, error: "reportText is required." };
  }

  if (!submittedAt) {
    return { ok: false, error: "submittedAt is required." };
  }

  if (!isValidIsoDate(submittedAt)) {
    return { ok: false, error: "submittedAt must be a valid ISO timestamp." };
  }

  return {
    ok: true,
    value: {
      hostname,
      url,
      mode,
      outcomeLabel,
      detectedBanner,
      extensionVersion,
      browserVersion,
      reportText,
      submittedAt
    }
  };
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_error) {
    return false;
  }
}

function isValidIsoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}
