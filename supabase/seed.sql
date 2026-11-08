-- Fictional simulation data only. Run after schema.sql and after auth seed.
-- No real names, phone numbers, addresses, or business data are used.

insert into public.commodities (name, shelf_life_days)
values
  ('Tomat', 7),
  ('Sawi', 5),
  ('Kubis', 14),
  ('Wortel', 21),
  ('Terong', 7),
  ('Selada', 5),
  ('Timun', 7),
  ('Cabai Merah', 10),
  ('Bawang Merah', 60),
  ('Bawang Putih', 90),
  ('Jahe Merah', 90),
  ('Pisang', 7),
  ('Mangga', 10),
  ('Alpukat', 7),
  ('Jeruk', 14)
on conflict (name) do update set shelf_life_days = excluded.shelf_life_days;

insert into public.settings (key, value)
values
  ('matching', '{"weights":{"reliability":0.4,"proximity":0.25,"gradeFit":0.2,"freshness":0.15},"maxSharePerSupplier":0.5,"backupBufferPct":0.3,"minBackupCount":1,"harvestLeadDays":1,"freshnessWindowDays":7,"maxDistanceKm":100,"confirmDeadlineDaysBeforeDelivery":3}'::jsonb),
  ('hub', '{"name":null,"regency":null,"mode":"virtual"}'::jsonb),
  ('scoring', '{"oldScoreWeight":0.7,"deliveryScoreWeight":0.3,"deliveredKgWeight":0.5,"onTimeWeight":0.3,"gradeOkWeight":0.2}'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.zone_distance (from_regency, to_regency, km)
values
  ('Bangli', 'Denpasar', 45), ('Denpasar', 'Bangli', 45),
  ('Bangli', 'Badung', 55), ('Badung', 'Bangli', 55),
  ('Tabanan', 'Denpasar', 30), ('Denpasar', 'Tabanan', 30),
  ('Tabanan', 'Badung', 40), ('Badung', 'Tabanan', 40),
  ('Gianyar', 'Denpasar', 25), ('Denpasar', 'Gianyar', 25),
  ('Gianyar', 'Badung', 35), ('Badung', 'Gianyar', 35),
  ('Karangasem', 'Denpasar', 70), ('Denpasar', 'Karangasem', 70),
  ('Karangasem', 'Badung', 85), ('Badung', 'Karangasem', 85),
  ('Buleleng', 'Denpasar', 85), ('Denpasar', 'Buleleng', 85),
  ('Buleleng', 'Badung', 95), ('Badung', 'Buleleng', 95),
  ('Jembrana', 'Denpasar', 90), ('Denpasar', 'Jembrana', 90),
  ('Jembrana', 'Badung', 105), ('Badung', 'Jembrana', 105)
on conflict (from_regency, to_regency) do update set km = excluded.km;

insert into public.baselines (metric, value, source)
values
  ('fill_rate', 0, 'ASUMSI'),
  ('shortage_events_per_month', 0, 'ASUMSI'),
  ('local_volume_kg_per_month', 0, 'ASUMSI')
on conflict (metric) do update set value = excluded.value, source = excluded.source;
