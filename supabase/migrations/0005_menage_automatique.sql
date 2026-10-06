-- =====================================================================
-- Quatuor · mode en ligne · 0005 : ménage automatique (pg_cron), chaque 1er du mois à 3 h 17 (UTC)
-- - journal_actions : lignes de plus de 7 jours (il ne sert qu'aux limites quotidiennes) ;
-- - signalements : plus de 12 mois (durée annoncée dans la politique de confidentialité).
-- À lancer UNE fois dans SQL Editor. Relançable sans risque (la tâche est remplacée, pas dupliquée).
-- =====================================================================

create or replace function public.menage_mensuel() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.journal_actions where le < now() - interval '7 days';
  delete from public.signalements where le < now() - interval '12 months';
end $$;
revoke execute on function public.menage_mensuel() from public, anon, authenticated;

-- pg_cron (extension fournie par Supabase) : activée puis tâche planifiée.
-- (Si l'extension n'existe pas, par exemple dans la base des tests, rien n'est planifié.)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.unschedule(jobid) from cron.job where jobname = 'quatuor-menage-mensuel';
    perform cron.schedule('quatuor-menage-mensuel', '17 3 1 * *', 'select public.menage_mensuel()');
  end if;
end
$do$;

-- Vérifier : select jobname, schedule, active from cron.job;
-- Historique : select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;
