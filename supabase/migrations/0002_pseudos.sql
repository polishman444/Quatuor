-- =====================================================================
-- Quatuor · mode en ligne · 0002 : pseudos (filtre des mots interdits, unicité, limites)
-- Même filtre que js/pseudos.js (les tests vérifient que les deux concordent).
-- =====================================================================

-- Mots interdits : partout = interdit même au milieu d'un pseudo ; sinon seulement comme mot entier
alter table public.mots_interdits drop constraint if exists mots_interdits_mot_check;
alter table public.mots_interdits add constraint mots_interdits_mot_check check (mot ~ '^[a-z]{2,30}$');
alter table public.mots_interdits add column partout boolean not null default false;

insert into public.mots_interdits (mot, partout) values
  ('connard', true), ('connasse', true), ('salope', true), ('salopard', true), ('salaud', true), ('encule',
  true), ('enculer', true), ('putain', true), ('batard', true), ('enfoire', true), ('tafiole', true), ('gouine',
  true), ('negre', true), ('negresse', true), ('bougnoul', true), ('youpin', true), ('couille', true),
  ('branleur', true), ('branlette', true), ('branler', true), ('pouffiasse', true), ('poufiasse', true),
  ('trisomique', true), ('attarde', true), ('pedophile', true), ('pedophil', true), ('zoophile', true),
  ('violeur', true), ('merdeux', true), ('merde', true), ('fdp', true), ('ntm', true), ('tamere', true),
  ('tagueule', true), ('suceur', true), ('suceuse', true), ('grossepute', true), ('filsdepute', true), ('porno',
  true), ('fuck', true), ('shit', true), ('bitch', true), ('bastard', true), ('asshole', true), ('cunt', true),
  ('pussy', true), ('whore', true), ('slut', true), ('faggot', true), ('nigger', true), ('nigga', true),
  ('retarded', true), ('rapist', true), ('porn', true), ('dildo', true), ('wank', true), ('twat', true), ('jizz',
  true), ('cumshot', true), ('blowjob', true), ('handjob', true), ('hentai', true), ('hitler', true), ('nazi',
  true), ('kkk', true), ('jihad', true), ('siegheil', true), ('heilhitler', true),
  ('con', false), ('cons', false), ('conne', false), ('cul', false), ('nique', false), ('niquer', false),
  ('pute', false), ('putes', false), ('pd', false), ('pede', false), ('tapette', false), ('bite', false),
  ('chatte', false), ('suce', false), ('sucer', false), ('abruti', false), ('debile', false), ('cretin', false),
  ('mongol', false), ('triso', false), ('pedo', false), ('viol', false), ('sexe', false), ('zizi', false),
  ('penis', false), ('vagin', false), ('fion', false), ('teub', false), ('keuf', false), ('salo', false),
  ('bouffon', false), ('fck', false), ('fuk', false), ('ass', false), ('dick', false), ('cock', false), ('fag',
  false), ('rape', false), ('sex', false), ('tits', false), ('boobs', false), ('anal', false), ('cum', false),
  ('nazis', false), ('admin', false), ('administrateur', false), ('moderateur', false), ('modo', false),
  ('staff', false), ('support', false), ('officiel', false), ('quatuor', false);

-- Normalisation : majuscule après minuscule → espace (mots collés), accents retirés, minuscules
create or replace function public.pseudo_sans_accents(p text) returns text
language sql immutable parallel safe as $$
  select lower(translate(regexp_replace(coalesce(p, ''), '([a-zà-ÿ])([A-ZÀ-Þ])', '\1 \2', 'g'),
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ',
    'AAAAAAACEEEEIIIIDNOOOOOOUUUUYTsaaaaaaaceeeeiiiidnoooooouuuuyty'))
$$;

-- Le pseudo contient-il un mot interdit ? (aussi en « leet » : 0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, @→a, $→s)
create or replace function public.pseudo_interdit(p text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  brut text := public.pseudo_sans_accents(p);
  leet text := translate(brut, '0134578@$', 'oieastbas');
  continu text := regexp_replace(leet, '[^a-z]', '', 'g');
  jetons text[] := array(select t from regexp_split_to_table(brut, '[^a-z]+') t where t <> ''
                         union select t from regexp_split_to_table(leet, '[^a-z]+') t where t <> '');
begin
  return exists (select 1 from public.mots_interdits m
    where (m.partout and position(m.mot in continu) > 0) or (not m.partout and m.mot = any(jetons)));
end $$;

-- Unicité : « Élodie », « elodie » et « ELODIE » sont le même pseudo
create or replace function public.cle_pseudo(p text) returns text
language sql immutable parallel safe as $$ select public.pseudo_sans_accents(p) $$;
drop index if exists public.profils_pseudo_unique;
create unique index profils_pseudo_unique on public.profils (public.cle_pseudo(pseudo)) where pseudo is not null;

-- Contrôle à chaque changement de pseudo ou d'avatar : format, filtre, 10 changements de pseudo par jour au maximum
create or replace function public.controler_profil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pseudo is distinct from old.pseudo then
    if new.pseudo is null then raise exception 'Pseudo obligatoire' using errcode = 'P0001'; end if;
    new.pseudo := btrim(new.pseudo);
    if new.pseudo !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{3,16}$' then raise exception 'pseudo_format' using errcode = 'P0001'; end if;
    if public.pseudo_interdit(new.pseudo) then raise exception 'pseudo_interdit' using errcode = 'P0001'; end if;
    if (select count(*) from public.journal_actions where user_id = old.id and action = 'pseudo' and le > now() - interval '1 day') >= 10 then
      raise exception 'trop_de_changements' using errcode = 'P0001';
    end if;
    insert into public.journal_actions (user_id, action) values (old.id, 'pseudo');
  end if;
  new.maj_le := now();
  return new;
end $$;
create trigger profils_controle before update on public.profils
  for each row execute function public.controler_profil();

-- Vérification avant validation : 'ok' | 'format' | 'interdit' | 'pris' (le mien ne compte pas comme pris)
create or replace function public.verifier_pseudo(p text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  p := btrim(coalesce(p, ''));
  if p !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{3,16}$' then return 'format'; end if;
  if public.pseudo_interdit(p) then return 'interdit'; end if;
  if exists (select 1 from public.profils where public.cle_pseudo(pseudo) = public.cle_pseudo(p) and id <> auth.uid()) then return 'pris'; end if;
  return 'ok';
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.assurer_profil(), public.fixer_base(jsonb), public.reinitialiser_progression(),
  public.mes_stats(date), public.verifier_pseudo(text) to authenticated;
-- cle_pseudo et pseudo_sans_accents sont utilisées par l'index (appelé avec les droits du joueur lors d'un UPDATE)
grant execute on function public.cle_pseudo(text), public.pseudo_sans_accents(text) to authenticated;
