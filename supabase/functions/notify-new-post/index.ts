// notify-new-post — sends a Web Push to everyone (except the poster) when a new
// journal entry is inserted into travel_notes. Triggered by a Supabase Database
// Webhook on INSERT. Deploy with:  supabase functions deploy notify-new-post --no-verify-jwt
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:you@example.com),
//   HOOK_SECRET (any random string; also set as the webhook's x-hook-secret header),
//   APP_URL (e.g. https://sticasale-maker.github.io/Travel/)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:trip@example.com";
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://sticasale-maker.github.io/Travel/";

// day_key -> destination name (keep in sync with the itinerary)
const DEST: Record<string, string> = {
  "2026-07-31": "Dubbo", "2026-08-01": "Cobar", "2026-08-02": "Broken Hill",
  "2026-08-03": "Silverton", "2026-08-04": "Woomera", "2026-08-05": "Coober Pedy",
  "2026-08-06": "Kings Canyon", "2026-08-07": "Redbank Gorge", "2026-08-08": "Ellery Creek",
  "2026-08-09": "Alice Springs", "2026-08-10": "Marla", "2026-08-11": "Port Augusta",
  "2026-08-12": "Hay", "2026-08-13": "Dee Why",
};

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (HOOK_SECRET && req.headers.get("x-hook-secret") !== HOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch (_) { /* ignore */ }
  const rec = payload?.record ?? payload;
  if (!rec || !rec.day_key) return new Response("no record", { status: 200 });

  const author = (rec.author || "Someone").toString();
  const dest = DEST[rec.day_key] || "the trip";
  const raw = (rec.body || rec.body_en || rec.body_it || "").toString().trim();
  const nPhotos = Array.isArray(rec.photo_paths) ? rec.photo_paths.length : 0;
  const hasAudio = !!rec.audio_path;
  let body: string;
  if (raw) body = raw.length > 90 ? raw.slice(0, 89) + "…" : raw;
  else if (nPhotos) body = nPhotos > 1 ? `📷 ${nPhotos} photos` : "📷 A photo";
  else if (hasAudio) body = "🎙️ A voice note";
  else body = "A new memory";
  const posterKey = (rec.person_key || "").toString();

  const { data: subs, error } = await supabase.from("push_subscriptions").select("*");
  if (error) return new Response("db error: " + error.message, { status: 500 });

  const notification = JSON.stringify({
    title: `${author} · ${dest}`,   // e.g. "Marco · Coober Pedy"
    body,
    url: APP_URL,
    tag: "new-post",
  });

  let sent = 0, removed = 0;
  await Promise.all((subs ?? []).map(async (s: any) => {
    if (posterKey && s.person_key && s.person_key === posterKey) return; // don't notify the poster
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notification,
      );
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) { // subscription gone — clean it up
        await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      }
    }
  }));

  return new Response(JSON.stringify({ sent, removed }), {
    headers: { "Content-Type": "application/json" },
  });
});
