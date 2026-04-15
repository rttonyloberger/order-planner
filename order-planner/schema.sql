-- Order Planner Schema
-- Run this in your Supabase SQL Editor

-- Suppliers / product config (drives the order calendar)
create table if not exists rt_config (
  id serial primary key,
  name text not null unique,
  lead_days int not null default 90,
  freq_days int not null default 30,
  safety_days int not null default 30,
  last_order_date date,
  sort_order int default 0,
  updated_at timestamptz default now()
);

create table if not exists sg_config (
  id serial primary key,
  name text not null unique,
  lead_days int not null default 90,
  freq_days int not null default 30,
  safety_days int not null default 30,
  last_order_date date,
  sort_order int default 0,
  updated_at timestamptz default now()
);

-- Purchase orders
create table if not exists purchase_orders (
  id text primary key,             -- PO number as string e.g. "103190"
  supplier text not null,
  status text not null default 'Draft',   -- Draft | Committed | Complete
  dest text not null,              -- BB | RT AWD | AWD | FBA
  entity text not null,            -- RT | SG
  table_id text not null,          -- rt-awd | rt-bb | sg-awdfba | sg-bb
  order_date date,
  eta date,
  po_value numeric(12,2),
  product_type text,               -- Non-Woven | Woven | Weed Barrier | Fishing Line | etc
  tracking_url text,
  ship_mode text,                  -- FCL | LCL
  box_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Calendar state (checked off slots, deleted dates)
create table if not exists calendar_state (
  key text primary key,            -- e.g. "rt|Dongyang|2026-05-14|AWD"
  checked boolean default false,
  deleted boolean default false,
  dest_checked text[],             -- for SG AWD/FBA slots: ['AWD'] or ['AWD','FBA']
  updated_at timestamptz default now()
);

-- App settings (month start, etc)
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- Seed RT config
insert into rt_config (name, lead_days, freq_days, safety_days, last_order_date, sort_order) values
  ('Dongyang Shanye Fishing', 90,  30,  30, '2025-12-18', 1),
  ('I-Lure',                  120, 60,  30, '2025-12-23', 2),
  ('Sourcepro',               180, 88,  30, '2025-10-19', 3),
  ('WEIGHT CO',               120, 64,  30, '2025-06-29', 4),
  ('JXL',                     90,  90,  30, '2025-11-13', 5),
  ('Weihai Huayue Sports',    120, 120, 30, '2025-11-04', 6),
  ('XINGTAI XIOU IMPORT',     120, 180, 30, '2025-08-02', 7)
on conflict (name) do nothing;

-- Seed SG config
insert into sg_config (name, lead_days, freq_days, safety_days, last_order_date, sort_order) values
  ('Non-Woven',   90, 30, 30, '2026-04-05', 1),
  ('Weed Barrier',90, 30, 30, '2026-04-05', 2),
  ('Woven',       90, 60, 30, '2026-02-20', 3)
on conflict (name) do nothing;

-- Seed existing POs from v21
insert into purchase_orders (id, supplier, status, dest, entity, table_id, order_date, eta, po_value) values
  ('103190','Dongyang Shanye Fishing','Committed','RT AWD','RT','rt-awd','2026-04-05','2026-06-08',69225.66),
  ('103013','Dongyang Shanye Fishing','Committed','RT AWD','RT','rt-awd','2026-03-14','2026-06-15',252675.90),
  ('103044','I-Lure','Committed','RT AWD','RT','rt-awd','2026-03-18','2026-06-15',99104.60),
  ('103276','JXL','Draft','RT AWD','RT','rt-awd','2026-04-14','2026-09-01',13805.00),
  ('102612','Sourcepro','Committed','RT AWD','RT','rt-awd','2025-12-23','2026-11-02',117655.12),
  ('102581','Dongyang Shanye Fishing','Committed','BB','RT','rt-bb','2025-12-12','2026-04-06',261006.38),
  ('102667','Dongyang Shanye Fishing','Committed','BB','RT','rt-bb','2026-01-06','2026-04-06',14828.32),
  ('103012','Dongyang Shanye Fishing','Committed','BB','RT','rt-bb','2026-03-14',null,231065.40),
  ('103191','Dongyang Shanye Fishing','Committed','BB','RT','rt-bb','2026-04-05','2026-07-12',237495.32),
  ('103043','I-Lure','Committed','BB','RT','rt-bb','2026-03-18','2026-06-15',122401.80),
  ('102782','Sourcepro','Committed','BB','RT','rt-bb','2026-02-24','2026-09-01',22041.60),
  ('102616','Sourcepro','Committed','BB','RT','rt-bb','2025-12-23','2026-11-02',18528.00),
  ('102655','WEIGHT CO','Committed','BB','RT','rt-bb','2026-01-06','2026-06-01',18559.88),
  ('103277','WEIGHT CO','Draft','BB','RT','rt-bb','2026-04-14','2026-10-05',19134.88),
  ('102630','CNBM INTERNATIONAL','Committed','FBA','SG','sg-awdfba','2025-12-28','2026-05-01',149909.17),
  ('102631','CNBM INTERNATIONAL','Committed','FBA','SG','sg-awdfba','2025-12-28','2026-05-01',88310.93),
  ('102766','CNBM INTERNATIONAL','Committed','AWD','SG','sg-awdfba','2026-02-20','2026-06-01',28352.45),
  ('102767','CNBM INTERNATIONAL','Committed','AWD','SG','sg-awdfba','2026-02-20','2026-06-01',45051.50),
  ('102779','CNBM INTERNATIONAL','Committed','AWD','SG','sg-awdfba','2026-02-23','2026-06-01',28352.45),
  ('103183','CNBM INTERNATIONAL','Committed','FBA','SG','sg-awdfba','2026-04-05','2026-06-07',60329.75),
  ('103070','CNBM INTERNATIONAL','Draft','FBA','SG','sg-awdfba','2026-03-21','2026-06-08',36145.00),
  ('103182','CNBM INTERNATIONAL','Committed','FBA','SG','sg-awdfba','2026-04-05','2026-06-14',26698.53),
  ('103185','CNBM INTERNATIONAL','Committed','BB','SG','sg-bb','2026-04-05','2026-06-08',80100.04),
  ('103184','CNBM INTERNATIONAL','Committed','BB','SG','sg-bb','2026-04-05','2026-07-05',38437.02)
on conflict (id) do nothing;

-- Seed month start
insert into app_settings (key, value) values ('month_start', '2026-04-01')
on conflict (key) do nothing;

-- Enable realtime on tables that need live sync
alter publication supabase_realtime add table purchase_orders;
alter publication supabase_realtime add table calendar_state;
alter publication supabase_realtime add table rt_config;
alter publication supabase_realtime add table sg_config;
alter publication supabase_realtime add table app_settings;
