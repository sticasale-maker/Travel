// Supabase Edge Function: translate-note
// Fills the missing-language body of a travel_notes row using DeepL.
// The poster app calls this (authenticated, anonymous session) right after a
// note syncs; it runs with the service role so it can update the row.
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

    const patch: Record<string, string> = {};
    if (note.lang === "en" && !(note.body_it || "").trim()) {
      patch.body_it = await translate(src, "IT");
    } else if (note.lang === "it" && !(note.body_en || "").trim()) {
      patch.body_en = await translate(src, "EN-GB");
    }

    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase
        .from("travel_notes").update(patch).eq("id", id);
      if (upErr) return json({ error: upErr.message }, 500);
    }
    return json({ ok: true, patch });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function translate(text: string, target: string): Promise<string> {
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
  return data.translations?.[0]?.text ?? text;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
