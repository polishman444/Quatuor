-- =====================================================================
-- Quatuor · mode en ligne · 0004 : sécurité (bloquer, signaler) et modération
-- La suppression du compte est faite par la fonction serveur « supprimer-compte »
-- (supabase/functions/supprimer-compte) : elle supprime le compte d'authentification, et
-- ON DELETE CASCADE efface toutes les lignes du joueur dans toutes les tables.
-- =====================================================================

-- Bloquer : le joueur disparaît de mes amis (et demandes) et ne peut plus m'ajouter (50 blocages par jour au maximum)
create or replace function public.bloquer(cible uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  if cible is null or cible = moi or not exists (select 1 from public.profils where id = cible) then return false; end if;
  if (select count(*) from public.journal_actions where user_id = moi and action = 'bloquer' and le > now() - interval '1 day') >= 50 then
    raise exception 'limite' using errcode = 'P0001';
  end if;
  insert into public.journal_actions (user_id, action) values (moi, 'bloquer');
  insert into public.blocages (bloqueur, bloque) values (moi, cible) on conflict do nothing;
  delete from public.amities where least(demandeur, destinataire) = least(moi, cible) and greatest(demandeur, destinataire) = greatest(moi, cible);
  return true;
end $$;

create or replace function public.debloquer(cible uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  delete from public.blocages where bloqueur = auth.uid() and bloque = cible;
  return found;
end $$;

-- Joueurs que j'ai bloqués (pour pouvoir les débloquer dans Paramètres › Compte)
create or replace function public.mes_bloques()
returns table (id uuid, pseudo text, avatar smallint, le timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.pseudo, p.avatar, b.le from public.blocages b join public.profils p on p.id = b.bloque
  where b.bloqueur = auth.uid() order by b.le desc
$$;

-- Signaler un joueur (pseudo inapproprié…) : 'ok' | 'deja' (déjà signalé aujourd'hui) | 'limite' (10 par jour) | 'inconnu'
create or replace function public.signaler(cible uuid, motif text default 'pseudo') returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  ps text;
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  select pseudo into ps from public.profils where id = cible;
  if not found or cible = moi then return 'inconnu'; end if;
  if exists (select 1 from public.signalements where auteur = moi and signalements.cible = signaler.cible and le > now() - interval '1 day') then return 'deja'; end if;
  if (select count(*) from public.signalements where auteur = moi and le > now() - interval '1 day') >= 10 then return 'limite'; end if;
  insert into public.signalements (auteur, cible, pseudo_signale, motif)
    values (moi, cible, ps, left(coalesce(nullif(btrim(motif), ''), 'pseudo'), 300));
  return 'ok';
end $$;

-- Pour toi, dans le tableau de bord (SQL Editor ou Table Editor) : signalements à traiter, avec les pseudos actuels.
-- Vue réservée à l'administration (aucun accès depuis l'appli).
create or replace view public.signalements_a_traiter with (security_invoker = true) as
  select s.id, s.le, s.motif, s.pseudo_signale, pc.pseudo as pseudo_actuel, s.cible, pa.pseudo as signale_par,
    (select count(*) from public.signalements x where x.cible = s.cible) as nb_signalements
  from public.signalements s
  left join public.profils pc on pc.id = s.cible
  left join public.profils pa on pa.id = s.auteur
  where not s.traite order by s.le desc;
revoke all on public.signalements_a_traiter from public, anon, authenticated;

-- Modération (tableau de bord) : effacer le pseudo d'un joueur (il devra en choisir un autre)
--   update public.profils set pseudo = null where id = '…';
--   update public.signalements set traite = true where cible = '…';
-- (le trigger controler_profil refuse un pseudo vide venant de l'appli, mais pas l'administration :)
create or replace function public.controler_profil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pseudo is distinct from old.pseudo then
    if new.pseudo is null then
      -- depuis l'appli (jeton de joueur) : interdit ; depuis le tableau de bord (sans jeton) : modération
      if auth.uid() is not null then raise exception 'Pseudo obligatoire' using errcode = 'P0001'; end if;
      new.maj_le := now();
      return new;
    end if;
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

-- Ménage : le journal des actions ne sert qu'aux limites quotidiennes (à lancer de temps en temps, facultatif)
--   delete from public.journal_actions where le < now() - interval '7 days';

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.assurer_profil(), public.fixer_base(jsonb), public.reinitialiser_progression(),
  public.mes_stats(date), public.verifier_pseudo(text), public.cle_pseudo(text), public.pseudo_sans_accents(text),
  public.envoyer_demande(text), public.repondre_demande(bigint, boolean), public.retirer_ami(uuid), public.mes_amis(text, date),
  public.bloquer(uuid), public.debloquer(uuid), public.mes_bloques(), public.signaler(uuid, text)
  to authenticated;
