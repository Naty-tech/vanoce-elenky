-- ============================================================================
--  Dárky pro miminko – databázové schéma pro Supabase
--  Zkopírujte CELÝ obsah tohoto souboru do SQL editoru v Supabase a spusťte.
-- ============================================================================
--
--  Princip ochrany jmen:
--    * Do tabulky `gifts` nemá nepřihlášený návštěvník (role `anon`) přístup.
--    * Čte se přes funkci list_gifts(), která vrací pouze true/false o tom,
--      zda je dárek zamluvený – jméno tedy databázi vůbec neopustí.
--    * Zapisuje se přes funkce claim_gift() / unclaim_gift().
--    * Jména vidí jen přihlášený správce (role `authenticated`).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tabulka --
create table if not exists public.gifts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 500),
  url         text check (char_length(url) <= 500),
  price_hint  text check (char_length(price_hint) <= 60),
  sort_order  integer not null default 0,
  claimed_by  text,
  claimed_at  timestamptz,
  claim_token uuid,
  created_at  timestamptz not null default now()
);

create index if not exists gifts_sort_idx on public.gifts (sort_order, created_at);

-- ------------------------------------------------------------------- RLS --
alter table public.gifts enable row level security;

-- Nepřihlášený návštěvník se k tabulce nedostane vůbec.
revoke all on table public.gifts from anon;

-- Přihlášený správce má plný přístup.
drop policy if exists "admin_full_access" on public.gifts;
create policy "admin_full_access" on public.gifts
  for all to authenticated
  using (true) with check (true);

-- ------------------------------------------------- veřejné čtení seznamu --
create or replace function public.list_gifts()
returns table (
  id          uuid,
  title       text,
  description text,
  url         text,
  price_hint  text,
  sort_order  integer,
  is_claimed  boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.title, g.description, g.url, g.price_hint, g.sort_order,
         (g.claimed_by is not null) as is_claimed
  from public.gifts g
  order by g.sort_order, g.created_at;
$$;

-- --------------------------------------------------------- zamluvení daru --
create or replace function public.claim_gift(p_id uuid, p_name text, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'INVALID_NAME';
  end if;
  if p_token is null then
    raise exception 'INVALID_TOKEN';
  end if;

  -- Zapíše se jen tehdy, je-li dárek dosud volný. Tím je ošetřeno i to,
  -- když dva lidé kliknou na stejný dárek ve stejnou chvíli.
  update public.gifts
     set claimed_by  = v_name,
         claimed_at  = now(),
         claim_token = p_token
   where id = p_id
     and claimed_by is null;

  return found;
end;
$$;

-- ------------------------------------------------ zrušení vlastní rezervace --
-- Zruší jen ten, kdo rezervaci vytvořil (shoda tokenu uloženého v zařízení).
create or replace function public.unclaim_gift(p_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gifts
     set claimed_by  = null,
         claimed_at  = null,
         claim_token = null
   where id = p_id
     and claim_token is not null
     and claim_token = p_token;

  return found;
end;
$$;

-- ---------------------------------------------------------------- práva --
revoke execute on function public.list_gifts()                     from public;
revoke execute on function public.claim_gift(uuid, text, uuid)     from public;
revoke execute on function public.unclaim_gift(uuid, uuid)         from public;

grant execute on function public.list_gifts()                 to anon, authenticated;
grant execute on function public.claim_gift(uuid, text, uuid) to anon, authenticated;
grant execute on function public.unclaim_gift(uuid, uuid)     to anon, authenticated;

-- ------------------------------------------------------- ukázkové dárky --
-- Klidně smažte nebo upravte přímo v aplikaci v režimu správce.
insert into public.gifts (title, description, price_hint, sort_order)
select * from (values
  ('Dětská vanička',        'Nejlépe s teploměrem a protiskluzovou vložkou.', 'cca 800 Kč',  10),
  ('Body a dupačky vel. 62','Klidně více kusů, spotřeba je velká.',           'cca 200 Kč',  20),
  ('Mušelínové plenky',     'Balení 3–5 kusů, hodí se pořád.',                'cca 300 Kč',  30),
  ('Hrací deka',            'S hrazdičkou a závěsnými hračkami.',             'cca 1 200 Kč',40),
  ('Chůvička',              'Stačí zvuková, video není nutné.',               'cca 1 500 Kč',50),
  ('Zavinovačka',           'Do kočárku, na zimní období.',                   'cca 900 Kč',  60)
) as v(title, description, price_hint, sort_order)
where not exists (select 1 from public.gifts);
