-- =====================================================================
-- Quatuor · mode en ligne · 0001 : comptes anonymes et synchronisation
-- À coller dans Supabase › SQL Editor (voir SETUP-EN-LIGNE.md), dans l'ordre des numéros.
--
-- Principes
-- - Row Level Security (RLS) activée sur TOUTES les tables.
-- - Les clients (rôle « authenticated », y compris les comptes anonymes) n'ont que les droits
--   accordés explicitement ici ; le rôle « anon » (sans session) n'a accès à rien.
-- - Les données d'un autre joueur ne sont JAMAIS lisibles directement : seulement via des
--   fonctions SECURITY DEFINER qui renvoient le strict nécessaire (parties suivantes).
-- - Toutes les tables dépendent de auth.users avec ON DELETE CASCADE : supprimer le compte
--   d'authentification efface toutes les données du joueur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profils : un par compte. Créé par assurer_profil() (pas de trigger sur auth.users).
-- base_* : statistiques de l'appareil au moment de la mise à jour vers le mode en ligne
-- (les anciens résultats n'ont pas de date) ; la série est recalculée à partir de cette base
-- et des résultats datés.
-- ---------------------------------------------------------------------
create table public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text check (pseudo is null or pseudo ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{3,16}$'),
  avatar smallint not null default 0 check (avatar between 0 and 15),
  code_ami text not null unique check (code_ami ~ '^[2-9A-HJ-NP-Z]{6}$'),
  cree_le timestamptz not null default now(),
  base_parties integer check (base_parties between 0 and 100000),
  base_victoires integer check (base_victoires between 0 and 100000),
  base_record integer check (base_record between 0 and 100000),
  base_serie integer check (base_serie between 0 and 100000),
  base_derniere_victoire date,
  base_dernier_jeu date,
  reinit_le timestamptz,
  maj_le timestamptz not null default now()
);
create unique index profils_pseudo_unique on public.profils (lower(pseudo));

-- ---------------------------------------------------------------------
-- Résultats : un par joueur et par grille. Le trigger garder_meilleur_resultat
-- conserve toujours le meilleur résultat (même règle que fusionnerResultat() dans js/calculs.js).
-- ---------------------------------------------------------------------
create table public.resultats (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grille_id text not null check (grille_id ~ '^[A-Za-z0-9_.:-]{1,40}$'),
  gagne boolean not null,
  erreurs smallint not null check (erreurs between 0 and 10),
  indices smallint not null default 0 check (indices between 0 and 2),
  essais smallint not null default 1 check (essais between 1 and 99),
  premier_gagne boolean not null,
  premier_erreurs smallint not null check (premier_erreurs between 0 and 10),
  duree_s integer check (duree_s between 0 and 86400),
  joue_le date check (joue_le between date '2024-01-01' and date '2100-01-01'),
  du_jour boolean not null default false,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 4096),
  maj_le timestamptz not null default now(),
  primary key (user_id, grille_id),
  check (not du_jour or joue_le is not null)
);
create index resultats_du_jour on public.resultats (user_id, joue_le) where du_jour;

-- ---------------------------------------------------------------------
-- Favoris (« Mon carnet ») : dernière modification gagnante ; supprime = pierre tombale
-- (pour que la suppression se propage aux autres appareils).
-- ---------------------------------------------------------------------
create table public.favoris (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fav_id text not null check (char_length(fav_id) between 1 and 200),
  donnees jsonb not null default '{}'::jsonb check (jsonb_typeof(donnees) = 'object' and pg_column_size(donnees) <= 4096),
  supprime boolean not null default false,
  maj_le timestamptz not null default now(),
  primary key (user_id, fav_id)
);

-- ---------------------------------------------------------------------
-- Amitiés, blocages, signalements, journal des actions (limites quotidiennes)
-- Écritures uniquement par fonctions (parties 4 et 5).
-- ---------------------------------------------------------------------
create table public.amities (
  id bigint generated always as identity primary key,
  demandeur uuid not null references auth.users(id) on delete cascade,
  destinataire uuid not null references auth.users(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee')),
  cree_le timestamptz not null default now(),
  repondu_le timestamptz,
  check (demandeur <> destinataire)
);
create unique index amities_paire on public.amities (least(demandeur, destinataire), greatest(demandeur, destinataire));
create index amities_destinataire on public.amities (destinataire);

create table public.blocages (
  bloqueur uuid not null references auth.users(id) on delete cascade,
  bloque uuid not null references auth.users(id) on delete cascade,
  le timestamptz not null default now(),
  primary key (bloqueur, bloque),
  check (bloqueur <> bloque)
);
create index blocages_bloque on public.blocages (bloque);

create table public.signalements (
  id bigint generated always as identity primary key,
  auteur uuid not null references auth.users(id) on delete cascade,
  cible uuid not null references auth.users(id) on delete cascade,
  pseudo_signale text,
  motif text not null default 'pseudo' check (char_length(motif) between 1 and 300),
  le timestamptz not null default now(),
  traite boolean not null default false,
  check (auteur <> cible)
);

create table public.mots_interdits (
  mot text primary key check (mot ~ '^[a-z0-9]{3,30}$')
);

create table public.journal_actions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  le timestamptz not null default now()
);
create index journal_actions_recent on public.journal_actions (user_id, action, le);

-- ---------------------------------------------------------------------
-- RLS : activée partout. Droits minimaux.
-- ---------------------------------------------------------------------
alter table public.profils enable row level security;
alter table public.resultats enable row level security;
alter table public.favoris enable row level security;
alter table public.amities enable row level security;
alter table public.blocages enable row level security;
alter table public.signalements enable row level security;
alter table public.mots_interdits enable row level security;
alter table public.journal_actions enable row level security;

revoke all on public.profils, public.resultats, public.favoris, public.amities, public.blocages,
  public.signalements, public.mots_interdits, public.journal_actions from public, anon, authenticated;

-- Profil : je lis le mien ; je ne modifie que mon pseudo et mon avatar
grant select on public.profils to authenticated;
grant update (pseudo, avatar) on public.profils to authenticated;
create policy profils_lire_le_mien on public.profils for select to authenticated using (id = auth.uid());
create policy profils_modifier_le_mien on public.profils for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Résultats et favoris : uniquement les miens
grant select, insert, update, delete on public.resultats to authenticated;
create policy resultats_les_miens on public.resultats for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.favoris to authenticated;
create policy favoris_les_miens on public.favoris for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Amitiés : je vois celles qui me concernent (sauf les demandes refusées) ; écriture par fonctions
grant select on public.amities to authenticated;
create policy amities_les_miennes on public.amities for select to authenticated
  using (auth.uid() in (demandeur, destinataire) and statut <> 'refusee');

-- Blocages : je vois ceux que j'ai faits ; écriture par fonctions
grant select on public.blocages to authenticated;
create policy blocages_les_miens on public.blocages for select to authenticated using (bloqueur = auth.uid());

-- signalements, mots_interdits, journal_actions : aucun accès client (RLS sans politique = rien).
-- Tu les consultes dans le tableau de bord Supabase (Table Editor).

-- ---------------------------------------------------------------------
-- Résultats : garder le meilleur (gagné > perdu, puis moins d'essais, d'erreurs, d'indices).
-- Le premier essai (stats et série) vient de la grille du jour si l'une des deux versions l'est,
-- sinon de la plus ancienne.
-- ---------------------------------------------------------------------
create or replace function public.garder_meilleur_resultat() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  ancien_premier boolean;
begin
  -- 1. Premier essai : celui de la grille du jour, sinon le plus ancien (sans date = plus ancien)
  ancien_premier := case
    when old.du_jour <> new.du_jour then old.du_jour
    when old.joue_le is null then true
    when new.joue_le is null then false
    else old.joue_le <= new.joue_le end;
  if ancien_premier then
    new.premier_gagne := old.premier_gagne; new.premier_erreurs := old.premier_erreurs;
    new.joue_le := old.joue_le; new.du_jour := old.du_jour;
  end if;
  -- 2. Résultat : le meilleur des deux ; à égalité, on garde l'ancien (et « solution vue » si l'un l'a vue)
  if (case when new.gagne then 0 else 1 end, new.essais, new.erreurs, new.indices)
     >= (case when old.gagne then 0 else 1 end, old.essais, old.erreurs, old.indices) then
    new.gagne := old.gagne; new.erreurs := old.erreurs; new.indices := old.indices; new.essais := old.essais;
    new.duree_s := old.duree_s;
    new.detail := old.detail || jsonb_build_object('vu',
      coalesce((old.detail->>'vu')::boolean, false) or coalesce((new.detail->>'vu')::boolean, false));
  end if;
  new.user_id := old.user_id; new.grille_id := old.grille_id;
  new.maj_le := now();
  return new;
end $$;
create trigger resultats_garder_meilleur before update on public.resultats
  for each row execute function public.garder_meilleur_resultat();

-- ---------------------------------------------------------------------
-- Favoris : la modification la plus récente gagne ; 500 favoris au maximum
-- ---------------------------------------------------------------------
create or replace function public.favoris_derniere_modif() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.maj_le > now() + interval '5 minutes' then new.maj_le := now(); end if;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.fav_id := old.fav_id;
    if new.maj_le < old.maj_le then return old; end if;
  elsif (select count(*) from public.favoris where user_id = new.user_id) >= 500 then
    raise exception 'Trop de favoris' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger favoris_derniere_modif before insert or update on public.favoris
  for each row execute function public.favoris_derniere_modif();

-- ---------------------------------------------------------------------
-- Code ami : 6 caractères faciles à lire (sans 0/O ni 1/I)
-- ---------------------------------------------------------------------
create or replace function public.generer_code_ami() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := '';
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

-- Crée mon profil s'il n'existe pas encore, et le renvoie
create or replace function public.assurer_profil() returns public.profils
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  p public.profils;
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  select * into p from public.profils where id = moi;
  if found then return p; end if;
  for essai in 1..20 loop
    begin
      insert into public.profils (id, code_ami) values (moi, public.generer_code_ami()) returning * into p;
      return p;
    exception when unique_violation then
      select * into p from public.profils where id = moi;   -- appel concurrent : déjà créé
      if found then return p; end if;
    end;
  end loop;
  raise exception 'Impossible de générer un code ami';
end $$;

-- ---------------------------------------------------------------------
-- Base des statistiques (stats de l'appareil avant le mode en ligne).
-- Première fois : enregistrée telle quelle. Ensuite (autre appareil, récupération) : on garde
-- le maximum de chaque compteur, et la série dont la dernière victoire est la plus récente.
-- ---------------------------------------------------------------------
create or replace function public.fixer_base(p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  parties int := least(greatest(coalesce((p->>'parties')::int, 0), 0), 100000);
  victoires int := least(greatest(coalesce((p->>'victoires')::int, 0), 0), 100000);
  record_ int := least(greatest(coalesce((p->>'record')::int, 0), 0), 100000);
  serie int := least(greatest(coalesce((p->>'serie')::int, 0), 0), 100000);
  der_vic date := nullif(p->>'derniereVictoire', '')::date;
  der_jeu date := nullif(p->>'dernierJeu', '')::date;
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  perform public.assurer_profil();
  update public.profils set
    base_parties = greatest(coalesce(base_parties, 0), parties),
    base_victoires = greatest(coalesce(base_victoires, 0), victoires),
    base_record = greatest(coalesce(base_record, 0), record_),
    base_serie = case when base_derniere_victoire is null or (der_vic is not null and der_vic > base_derniere_victoire) then serie
                      when der_vic = base_derniere_victoire then greatest(coalesce(base_serie, 0), serie)
                      else base_serie end,
    base_derniere_victoire = case when base_derniere_victoire is null then der_vic else greatest(base_derniere_victoire, der_vic) end,
    base_dernier_jeu = case when base_dernier_jeu is null then der_jeu else greatest(base_dernier_jeu, der_jeu) end,
    maj_le = now()
  where id = moi;
end $$;

-- « Réinitialiser ma progression » : efface résultats et base ; les autres appareils s'alignent (reinit_le)
create or replace function public.reinitialiser_progression() returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  t timestamptz := now();
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  delete from public.resultats where user_id = moi;
  update public.profils set base_parties = null, base_victoires = null, base_record = null, base_serie = null,
    base_derniere_victoire = null, base_dernier_jeu = null, reinit_le = t, maj_le = t where id = moi;
  return t;
end $$;

-- ---------------------------------------------------------------------
-- Statistiques recalculées (même algorithme que calculerStats() dans js/calculs.js)
-- Jours gagnés  = grilles du jour réussies au 1er essai + fenêtre de la série de base (au moins la dernière victoire).
-- Jours joués   = grilles du jour terminées + jours gagnés + dernier jour joué de base.
-- Série : à partir d'aujourd'hui si joué aujourd'hui, sinon d'hier ; 0 si ce jour-là est perdu.
-- ---------------------------------------------------------------------
create or replace function public.calcul_stats(uid uuid, aujourdhui date)
returns table (serie int, record int, parties int, victoires int, derniere_victoire date, dernier_jeu date)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  b public.profils;
  gagnes date[];
  joues date[];
  depart date;
  d date;
  n int := 0;
  meilleure int := 0;
  courante int := 0;
  precedent date := null;
begin
  select * into b from public.profils where id = uid;
  gagnes := array(
    select distinct x from (
      select joue_le as x from public.resultats where user_id = uid and du_jour and premier_gagne
      union all
      select generate_series(b.base_derniere_victoire - (greatest(coalesce(b.base_serie, 0), 1) - 1), b.base_derniere_victoire, interval '1 day')::date
        where b.base_derniere_victoire is not null
    ) s order by x);
  joues := array(
    select distinct x from (
      select joue_le as x from public.resultats where user_id = uid and du_jour
      union all select unnest(gagnes)
      union all select b.base_dernier_jeu where b.base_dernier_jeu is not null
    ) s order by x);

  -- série en cours
  if aujourdhui = any(joues) then depart := aujourdhui;
  elsif aujourdhui - 1 = any(joues) then depart := aujourdhui - 1;
  end if;
  if depart is not null then
    d := depart;
    while d = any(gagnes) loop n := n + 1; d := d - 1; end loop;
  end if;
  serie := n;

  -- record : plus longue suite de jours gagnés consécutifs
  foreach d in array gagnes loop
    if precedent is not null and d = precedent + 1 then courante := courante + 1; else courante := 1; end if;
    meilleure := greatest(meilleure, courante); precedent := d;
  end loop;
  record := greatest(coalesce(b.base_record, 0), meilleure);

  parties := coalesce(b.base_parties, 0) + (select count(distinct joue_le)::int from public.resultats
    where user_id = uid and du_jour and (b.base_dernier_jeu is null or joue_le > b.base_dernier_jeu));
  victoires := coalesce(b.base_victoires, 0) + (select count(distinct joue_le)::int from public.resultats
    where user_id = uid and du_jour and premier_gagne and (b.base_dernier_jeu is null or joue_le > b.base_dernier_jeu));
  derniere_victoire := gagnes[array_upper(gagnes, 1)];
  dernier_jeu := joues[array_upper(joues, 1)];
  return next;
end $$;

create or replace function public.mes_stats(aujourdhui date)
returns table (serie int, record int, parties int, victoires int, derniere_victoire date, dernier_jeu date)
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.calcul_stats(auth.uid(), aujourdhui)
$$;

-- ---------------------------------------------------------------------
-- Fonctions : personne par défaut, puis uniquement les comptes connectés pour les fonctions publiques
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.assurer_profil(), public.fixer_base(jsonb), public.reinitialiser_progression(),
  public.mes_stats(date) to authenticated;
-- (generer_code_ami et calcul_stats restent internes)
