// config.js  — fill these in. Do NOT commit the service_role key anywhere.
window.TRAVEL_CONFIG = {
  SUPABASE_URL: "https://jvcijeecbpzylzwoutch.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_I9j0iFOpWEIyt3eUsXSo1w_MEuCNOMk",
  PHOTO_MAX_DIM: 1600,       // px, longest edge, before upload
  PHOTO_JPEG_QUALITY: 0.7,
  // Web Push (public key — safe to ship). Private key lives only as a Supabase
  // secret used by the notify-new-post edge function.
  VAPID_PUBLIC_KEY: "BA5JmNE3YnpmFutrERNKwS3qt1Ooluss35TPtf6uYl337mWiyT2AvS00bJx-_3FgJpKNov3PzV45M5QTl7aXuAE"
};
