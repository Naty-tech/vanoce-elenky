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
  SUPABASE_URL: "https://smqvpjlcuebigtvzxmos.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1UvGt28UCE_CweF4MFSCNw_ahSACuln",

  // Nadpis aplikace – klidně změňte
  APP_TITLE: "První Vánoce Elenky"
};
