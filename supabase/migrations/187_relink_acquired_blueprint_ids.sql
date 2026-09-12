-- Relink leftover acquired / target-list IDs onto current catalog keys.
-- Exact pairs only from the 2026-09-11 live audit (unique catalog hit after
-- stripping _scitem, or unique bp_ prefix). No fuzzy / display-name remaps.
-- Later patches: npm run relink-acquired-blueprint-ids (approval list for anything else).

CREATE TEMP TABLE _relink_pairs (
  from_id text PRIMARY KEY,
  to_id text NOT NULL
);

INSERT INTO _relink_pairs (from_id, to_id) VALUES
  ('hrst_laserscattergun_s2', 'bp_hrst_laserscattergun_s2'),
  ('cool_tydt_s02_heatsink_scitem', 'cool_tydt_s02_heatsink'),
  ('cool_tydt_s02_icebox_scitem', 'cool_tydt_s02_icebox'),
  ('cool_tydt_s02_nightfall_scitem', 'cool_tydt_s02_nightfall'),
  ('cool_tydt_s01_heatsafe_scitem', 'cool_tydt_s01_heatsafe'),
  ('cool_tydt_s01_snowblind_scitem', 'cool_tydt_s01_snowblind'),
  ('cool_tydt_s01_vaporblock_scitem', 'cool_tydt_s01_vaporblock'),
  ('powr_just_s00_defiant_scitem', 'powr_just_s00_defiant'),
  ('powr_just_s01_endurance_scitem', 'powr_just_s01_endurance'),
  ('powr_just_s02_sedulity_scitem', 'powr_just_s02_sedulity'),
  ('qdrv_just_s03_agni_scitem', 'qdrv_just_s03_agni'),
  ('qdrv_just_s01_colossus_scitem', 'qdrv_just_s01_colossus'),
  ('qdrv_just_s02_huracan_scitem', 'qdrv_just_s02_huracan'),
  ('qdrv_raco_s01_spectre_scitem', 'qdrv_raco_s01_spectre'),
  ('qdrv_raco_s01_zephyr_scitem', 'qdrv_raco_s01_zephyr'),
  ('shld_basl_s03_barbican_scitem', 'shld_basl_s03_barbican'),
  ('shld_basl_s01_guardian_scitem', 'shld_basl_s01_guardian'),
  ('cool_wcpr_s01_gelid_scitem', 'cool_wcpr_s01_gelid'),
  ('powr_tydt_s02_cirrus_scitem', 'powr_tydt_s02_cirrus'),
  ('shld_behr_s03_5ca_scitem', 'shld_behr_s03_5ca'),
  ('powr_aegs_s03_quadracellmx_scitem', 'powr_aegs_s03_quadracellmx');

UPDATE public.acquired_blueprints AS ab
SET blueprint_id = p.to_id
FROM _relink_pairs AS p
WHERE ab.blueprint_id = p.from_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.acquired_blueprints AS x
    WHERE x.user_id = ab.user_id
      AND x.blueprint_id = p.to_id
  );

DELETE FROM public.acquired_blueprints AS ab
USING _relink_pairs AS p
WHERE ab.blueprint_id = p.from_id;

UPDATE public.target_list_blueprints AS tb
SET blueprint_id = p.to_id
FROM _relink_pairs AS p
WHERE tb.blueprint_id = p.from_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.target_list_blueprints AS x
    WHERE x.user_id = tb.user_id
      AND x.blueprint_id = p.to_id
  );

DELETE FROM public.target_list_blueprints AS tb
USING _relink_pairs AS p
WHERE tb.blueprint_id = p.from_id;
