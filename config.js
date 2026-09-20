/* ============================================================================
 *  Nastavení připojení k databázi Supabase.
 *
 *  Oba údaje najdete v Supabase: Project Settings → API
 *    SUPABASE_URL      = "Project URL"        (např. https://abcdefgh.supabase.co)
 *    SUPABASE_ANON_KEY = klíč "anon public"   (dlouhý řetězec)
 *
 *  Anon klíč je veřejný záměrně – je určený do prohlížeče. Bezpečnost stojí
 *  na pravidlech v databázi (viz supabase/schema.sql), ne na jeho utajení.
 * ==========================================================================*/
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Nadpis aplikace – klidně změňte
  APP_TITLE: "První Vánoce Elenky"
};
