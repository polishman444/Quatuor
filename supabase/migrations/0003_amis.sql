-- =====================================================================
-- Quatuor · mode en ligne · 0003 : amis
-- Toutes les opérations passent par ces fonctions (la table amities n'est pas modifiable directement).
-- Un joueur ne voit JAMAIS les données d'un autre directement : mes_amis() renvoie seulement
-- pseudo, avatar, série et, pour la grille du jour, un résultat sans spoiler (réussie/ratée, erreurs),
-- et seulement si j'ai moi-même terminé cette grille.
-- =====================================================================

-- Les deux joueurs sont-ils bloqués (dans un sens ou dans l'autre) ?
create or replace function public.bloques_entre(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.blocages where (bloqueur = a and bloque = b) or (bloqueur = b and bloque = a))
$$;

-- Demande d'ami par code. Réponses : 'envoyee' | 'acceptee' (il m'avait déjà demandé) | 'deja_amis' | 'deja_envoyee'
-- | 'introuvable' (code inconnu, ou blocage : on ne le révèle pas) | 'soi_meme' | 'pseudo_requis' | 'limite' (20/jour) | 'trop_amis' (200)
create or replace function public.envoyer_demande(code text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  cible uuid;
  a public.amities;
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  if not exists (select 1 from public.profils where id = moi and pseudo is not null) then return 'pseudo_requis'; end if;
  -- chaque essai compte (même un code inconnu) : impossible de chercher des codes au hasard
  if (select count(*) from public.journal_actions where user_id = moi and action = 'demande_ami' and le > now() - interval '1 day') >= 20 then
    return 'limite';
  end if;
  insert into public.journal_actions (user_id, action) values (moi, 'demande_ami');
  code := upper(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
  if code !~ '^[2-9A-HJ-NP-Z]{6}$' then return 'introuvable'; end if;
  select id into cible from public.profils where code_ami = code;
  if cible is null or public.bloques_entre(moi, cible) then return 'introuvable'; end if;
  if cible = moi then return 'soi_meme'; end if;
  select * into a from public.amities where least(demandeur, destinataire) = least(moi, cible) and greatest(demandeur, destinataire) = greatest(moi, cible);
  if found then
    if a.statut = 'acceptee' then return 'deja_amis'; end if;
    if a.statut = 'en_attente' and a.demandeur = moi then return 'deja_envoyee'; end if;
    if a.statut = 'en_attente' and a.demandeur = cible then
      update public.amities set statut = 'acceptee', repondu_le = now() where id = a.id;
      return 'acceptee';
    end if;
    -- refusée : pendant 7 jours, le demandeur refusé n'est pas prévenu et ne peut pas insister
    if a.demandeur = moi and a.repondu_le > now() - interval '7 days' then return 'envoyee'; end if;
    delete from public.amities where id = a.id;
  end if;
  if (select count(*) from public.amities where statut = 'acceptee' and moi in (demandeur, destinataire)) >= 200 then return 'trop_amis'; end if;
  insert into public.amities (demandeur, destinataire) values (moi, cible);
  return 'envoyee';
end $$;

-- Réponse à une demande reçue (seul le destinataire peut répondre)
create or replace function public.repondre_demande(demande bigint, accepter boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  if accepter and (select count(*) from public.amities where statut = 'acceptee' and moi in (demandeur, destinataire)) >= 200 then
    raise exception 'trop_amis' using errcode = 'P0001';
  end if;
  update public.amities set statut = case when accepter then 'acceptee' else 'refusee' end, repondu_le = now()
    where id = demande and destinataire = moi and statut = 'en_attente';
  return found;
end $$;

-- Retirer un ami (ou annuler une demande envoyée)
create or replace function public.retirer_ami(ami uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  delete from public.amities where least(demandeur, destinataire) = least(moi, ami) and greatest(demandeur, destinataire) = greatest(moi, ami)
    and statut <> 'refusee';
  return found;
end $$;

-- Mes amis et demandes. grille = grille du jour de l'appelant, jour = sa date locale.
-- etat : 'ami' | 'recue' | 'envoyee'
-- aujourdhui (amis seulement) : 'pas_jouee' | 'masque' (il a joué, mais je n'ai pas encore terminé) | 'reussie' | 'ratee'
create or replace function public.mes_amis(grille text, jour date)
returns table (ami uuid, pseudo text, avatar smallint, etat text, demande bigint, serie int, record int,
               aujourdhui text, erreurs smallint, essais smallint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := auth.uid();
  j_ai_fini boolean;
begin
  if moi is null then raise exception 'Non connecté' using errcode = '28000'; end if;
  j_ai_fini := exists (select 1 from public.resultats r where r.user_id = moi and r.grille_id = grille);
  return query
  select p.id, p.pseudo, p.avatar,
    case when a.statut = 'acceptee' then 'ami' when a.destinataire = moi then 'recue' else 'envoyee' end,
    a.id,
    case when a.statut = 'acceptee' then s.serie end,
    case when a.statut = 'acceptee' then s.record end,
    case when a.statut <> 'acceptee' then null
         when r.grille_id is null then 'pas_jouee'
         when not j_ai_fini then 'masque'
         when r.gagne then 'reussie' else 'ratee' end,
    case when a.statut = 'acceptee' and j_ai_fini then r.erreurs end,
    case when a.statut = 'acceptee' and j_ai_fini then r.essais end
  from public.amities a
  join public.profils p on p.id = case when a.demandeur = moi then a.destinataire else a.demandeur end
  left join lateral (select * from public.calcul_stats(p.id, jour)) s on a.statut = 'acceptee'
  left join public.resultats r on r.user_id = p.id and r.grille_id = grille and a.statut = 'acceptee'
  where moi in (a.demandeur, a.destinataire) and a.statut <> 'refusee' and not public.bloques_entre(moi, p.id)
  order by 4, p.pseudo;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.assurer_profil(), public.fixer_base(jsonb), public.reinitialiser_progression(),
  public.mes_stats(date), public.verifier_pseudo(text), public.cle_pseudo(text), public.pseudo_sans_accents(text),
  public.envoyer_demande(text), public.repondre_demande(bigint, boolean), public.retirer_ami(uuid), public.mes_amis(text, date)
  to authenticated;
