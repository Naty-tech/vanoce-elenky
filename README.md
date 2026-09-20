# 🎁 První Vánoce Elenky

Malá webová aplikace se seznamem dárků pro Elenku. Rodina si otevře odkaz, u dárku
klepne na **„Zamluvím to já“** a zapíše své jméno. Ostatní pak u dárku vidí jen
**„Zamluveno“** — jméno zůstává skryté, vidíte ho pouze vy ve správě seznamu.

Aplikace jde na telefonu přidat na plochu a chová se pak jako běžná aplikace (PWA).

---

## Co k tomu potřebujete

| | |
|---|---|
| Účet na [GitHubu](https://github.com) | zdarma — hostuje samotnou aplikaci |
| Účet na [Supabase](https://supabase.com) | zdarma — ukládá dárky a rezervace |

Obojí zvládnete založit e-mailem, nic se neplatí.

> **Proč dvě služby?** GitHub Pages umí zobrazit jen hotovou stránku, nic si nepamatuje.
> Supabase je databáze, do které se rezervace zapisují, aby je viděli všichni.

---

## 1. Databáze v Supabase

1. Na [supabase.com](https://supabase.com) klikněte na **Start your project** a založte
   si účet.
2. **New project** → zvolte název (např. `darky-miminko`), heslo k databázi si uložte
   (budete ho potřebovat jen výjimečně), region nechte na Evropě. Vytvoření trvá ~2 minuty.
3. V levém menu **SQL Editor** → **New query**. Otevřete soubor
   [`supabase/schema.sql`](supabase/schema.sql) z tohoto repozitáře, celý jeho obsah
   zkopírujte do editoru a klikněte na **Run**. Mělo by se objevit „Success“.
4. V levém menu **Authentication** → **Users** → **Add user** → **Create new user**.
   Zadejte svůj e-mail a heslo a zaškrtněte **Auto Confirm User**.
   👉 *Tímto účtem se budete přihlašovat do správy seznamu.*
5. V levém menu **Project Settings** → **API**. Odsud si opište dvě hodnoty:
   - **Project URL** (např. `https://abcdefgh.supabase.co`)
   - klíč **anon public** (dlouhý řetězec)

## 2. Propojení aplikace

Otevřete soubor [`config.js`](config.js) a vyplňte obě hodnoty z předchozího kroku:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  APP_TITLE: "První Vánoce Elenky"
};
```

> Anon klíč je veřejný záměrně — je určený do prohlížeče. Vaše data chrání pravidla
> nastavená v `schema.sql`: nepřihlášený návštěvník se k tabulce s jmény vůbec nedostane,
> vidí jen seznam dárků a informaci „zamluveno / volné“.

## 3. Nahrání na GitHub

V adresáři projektu:

```bash
git init && git add -A && git commit -m "Darky pro miminko"
```

```bash
gh repo create darky-miminko --public --source=. --push
```

(Nemáte-li nástroj `gh`, založte repozitář na webu GitHubu a použijte
`git remote add origin …` a `git push -u origin main`. Repozitář musí být **veřejný** —
GitHub Pages jsou zdarma jen pro veřejné repozitáře.)

Potom na GitHubu: **Settings → Pages → Build and deployment → Deploy from a branch**,
vyberte větev `main` a složku `/ (root)`, uložte. Za minutu až dvě poběží aplikace na:

```
https://VASE-JMENO.github.io/darky-miminko/
```

Tento odkaz rozešlete rodině.

## 4. Přidání dárků

V aplikaci klepněte dole na **Správa seznamu** (nebo připište `#admin` za adresu),
přihlaste se e-mailem a heslem z kroku 1.4 a přidávejte, upravujte či mažte dárky.
Ve správě u každého dárku vidíte i jméno člověka, který ho obstará, a můžete rezervaci
uvolnit.

---

## Jak to funguje pro rodinu

- Otevřou odkaz v telefonu — není potřeba žádná registrace ani heslo.
- U dárku klepnou na **Zamluvím to já** a napíšou jméno.
- Ostatní uvidí jen štítek **Zamluveno**.
- Zrušit rezervaci může ten, kdo ji vytvořil, **ze stejného telefonu** (aplikace si
  drobnou značku ukládá v prohlížeči). Kdykoli ji můžete uvolnit i vy ve správě.
- Chrome na Androidu nabídne **Přidat na plochu**; na iPhonu v Safari přes tlačítko
  **Sdílet → Přidat na plochu**.

## Úpravy aplikace

| Co chci změnit | Kde |
|---|---|
| Nadpis a název | `config.js` (`APP_TITLE`) |
| Uvítací text | `index.html`, odstavec `hero-text` |
| Barvy | `styles.css`, sekce `:root` |
| Ikonu aplikace | `scripts/generate-icons.mjs`, pak `node scripts/generate-icons.mjs` |

Po každé úpravě souborů zvyšte číslo `CACHE_VERSION` v [`sw.js`](sw.js)
(`darky-v1` → `darky-v2`), aby si telefony stáhly novou verzi.

## Zkouška na vlastním počítači

```bash
npx serve .
```

Pak otevřete `http://localhost:3000`.

## Struktura projektu

```
index.html              vzhled a rozvržení stránky
styles.css              barvy a styl
config.js               připojení k databázi (vyplňujete vy)
app.js                  veškerá logika aplikace
sw.js                   offline režim
manifest.webmanifest    nastavení instalace na plochu
icons/                  ikony aplikace
scripts/                generátor ikon
supabase/schema.sql     databázové schéma pro Supabase
```
