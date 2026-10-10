-- =====================================================================
-- Quatuor · mode en ligne · 0006 : jusqu'à 6 indices par grille (au lieu de 2)
-- Avec les pubs récompensées, un joueur peut prendre jusqu'à 6 indices sur une grille (js/jeu.js, MAX_HINTS).
-- ⚠️ À lancer dans SQL Editor AVANT de publier la version de l'appli avec les pubs : sinon, la synchronisation
--    d'un résultat avec plus de 2 indices serait refusée par la base. Relançable sans risque.
-- =====================================================================

alter table public.resultats drop constraint if exists resultats_indices_check;
alter table public.resultats add constraint resultats_indices_check check (indices between 0 and 6);
