// Supabase Edge Function: translate-note
// Auto-detects the language a note was written in, stores the original in its
// own column and the translation in the other (body_en / body_it), and sets
// `lang` to the detected source. The poster app calls this (authenticated,
// anonymous session) right after a note syncs; it runs with the service role.
//
// Deploy:
//   supabase functions deploy translate-note
//   supabase secrets set DEEPL_KEY=xxxxxxxx:fx      (DeepL free keys end in ":fx")
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { id } = await req.json();
    if (!id) return json({ error: "missing id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: note, error } = await supabase
      .from("travel_notes").select("*").eq("id", id).single();
    if (error || !note) return json({ error: "not found" }, 404);

    const src = (note.body || note.body_en || note.body_it || "").trim();
    if (!src) return json({ ok: true, skipped: "empty" });
    // Already have both languages? nothing to do (client clears both on edit).
    if ((note.body_en || "").trim() && (note.body_it || "").trim()) {
      return json({ ok: true, skipped: "already done" });
    }

    // Translate to English and read DeepL's detected source language.
    const en = await translate(src, "EN-GB");
    let lang: string, body_en: string, body_it: string;
    if (en.detected.toUpperCase().startsWith("IT")) {
      lang = "it"; body_it = src; body_en = en.text;
    } else {
      lang = "en"; body_en = src;
      body_it = (await translate(src, "IT")).text;
    }

    const { error: upErr } = await supabase
      .from("travel_notes").update({ lang, body_en, body_it }).eq("id", id);
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ ok: true, lang });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function translate(text: string, target: string): Promise<{ text: string; detected: string }> {
  const key = Deno.env.get("DEEPL_KEY");
  if (!key) throw new Error("DEEPL_KEY not set");
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: target }),
  });
  if (!res.ok) throw new Error("DeepL " + res.status);
  const data = await res.json();
  const tr = data.translations?.[0];
  return { text: tr?.text ?? text, detected: tr?.detected_source_language ?? "" };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
