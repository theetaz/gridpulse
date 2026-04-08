-- =============================================
-- D1 Schema for කරන්ට් කට්
-- =============================================

-- CEB Areas (static, seeded from GetAreasByProvince)
-- center_lat/lon are resolved from GeoPop at seed time and used to
-- answer "which areas are near this point?" for the lazy poller.
-- last_polled_at is used by services/ceb.service.ts as the TTL clock.
CREATE TABLE IF NOT EXISTS areas (
  area_id        TEXT PRIMARY KEY,      -- CEB AreaId e.g. "01"
  area_name      TEXT NOT NULL,         -- e.g. "Colombo (North)"
  province_id    TEXT NOT NULL,         -- e.g. "CC"
  province_name  TEXT,                  -- e.g. "Colombo City"
  num_customers  INTEGER DEFAULT 0,
  center_lat     REAL,
  center_lon     REAL,
  last_polled_at TEXT,                  -- ISO-8601; NULL = never polled
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_areas_geo ON areas(center_lat, center_lon);

-- CEB Official Outages (from /Incognito/ endpoints)
CREATE TABLE IF NOT EXISTS ceb_outages (
  id                TEXT PRIMARY KEY,       -- {areaId}_{outageTypeId}_{hash}
  area_id           TEXT NOT NULL REFERENCES areas(area_id),
  outage_type_id    INTEGER NOT NULL,       -- 1=Breakdown, 3=DemandMgmt, other=Planned
  num_customers     INTEGER DEFAULT 0,
  timestamp         TEXT,                   -- CEB TimeStamp field
  generated_time    TEXT,                   -- CEB GeneratedTime
  start_time        TEXT,
  end_time          TEXT,
  group_id          TEXT,                   -- demand management
  interruption_id   TEXT,                   -- planned outages
  interruption_type TEXT,
  polygon           TEXT,                   -- JSON array of {lat, lon}
  centroid_lat      REAL,
  centroid_lon      REAL,
  status            TEXT DEFAULT 'active',  -- active, resolved
  first_seen_at     TEXT DEFAULT (datetime('now')),
  last_seen_at      TEXT DEFAULT (datetime('now')),
  resolved_at       TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ceb_outages_area   ON ceb_outages(area_id, status);
CREATE INDEX IF NOT EXISTS idx_ceb_outages_status ON ceb_outages(status, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_ceb_outages_geo    ON ceb_outages(centroid_lat, centroid_lon);

-- Crowdsourced Reports
CREATE TABLE IF NOT EXISTS reports (
  id                  TEXT PRIMARY KEY,     -- UUID
  user_id             TEXT,                 -- anonymous device id, nullable
  area_id             TEXT REFERENCES areas(area_id),
  area_name           TEXT,
  lat                 REAL NOT NULL,
  lon                 REAL NOT NULL,
  type                TEXT NOT NULL,        -- 'unplanned', 'scheduled', 'restored'
  status              TEXT DEFAULT 'active',-- active, confirmed, resolved, spam
  description         TEXT,
  photo_key           TEXT,                 -- R2 object key
  confirmed_by        INTEGER DEFAULT 1,
  reported_at         TEXT DEFAULT (datetime('now')),
  resolved_at         TEXT,
  population_affected INTEGER,              -- from GeoPop /exposure
  nearest_place       TEXT,                 -- from GeoPop /reverse
  linked_ceb_id       TEXT REFERENCES ceb_outages(id), -- fusion: linked CEB outage
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_area   ON reports(area_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_geo    ON reports(lat, lon);
CREATE INDEX IF NOT EXISTS idx_reports_time   ON reports(reported_at);
CREATE INDEX IF NOT EXISTS idx_reports_linked ON reports(linked_ceb_id);

-- Confirmations (upvotes). outage_id is polymorphic — it can point to a
-- ceb_outages.id (e.g. "01_1_6.9271_79.8612") OR a reports.id (UUID).
-- We deliberately omit a FK so a single device's confirmation works for
-- either source.
CREATE TABLE IF NOT EXISTS confirmations (
  outage_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  confirmed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (outage_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmations_outage ON confirmations(outage_id);

-- User Area Subscriptions (for push notifications)
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id       TEXT NOT NULL,
  area_id       TEXT NOT NULL REFERENCES areas(area_id),
  push_endpoint TEXT,
  push_keys     TEXT,                       -- JSON {p256dh, auth}
  created_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_subs_area ON subscriptions(area_id);

-- Outage History (for analytics)
-- area_id is nullable: a crowd report submitted far from any CEB outage
-- has no CEB area assigned, but we still want to retain it for analytics
-- (just not in per-area rollups, which already filter by area_id).
CREATE TABLE IF NOT EXISTS outage_history (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,        -- 'ceb' or 'crowdsourced'
  source_id           TEXT NOT NULL,
  area_id             TEXT,
  outage_type         TEXT NOT NULL,
  num_customers       INTEGER,
  population_affected INTEGER,
  started_at          TEXT NOT NULL,
  resolved_at         TEXT,
  duration_mins       INTEGER,              -- computed on resolution
  centroid_lat        REAL,
  centroid_lon        REAL,
  created_at          TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_area_time ON outage_history(area_id, started_at);
CREATE INDEX IF NOT EXISTS idx_history_time      ON outage_history(started_at);

-- Businesses (open with generator during outages)
CREATE TABLE IF NOT EXISTS businesses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT,                       -- shop, restaurant, pharmacy, etc.
  lat           REAL NOT NULL,
  lon           REAL NOT NULL,
  area_id       TEXT REFERENCES areas(area_id),
  has_generator BOOLEAN DEFAULT false,
  is_open       BOOLEAN DEFAULT false,
  phone         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_businesses_area ON businesses(area_id, is_open);

-- Users (minimal, anonymous-first)
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- ULID
  phone        TEXT UNIQUE,
  display_name TEXT,
  language     TEXT DEFAULT 'en',           -- en, si, ta
  home_area_id TEXT REFERENCES areas(area_id),
  created_at   TEXT DEFAULT (datetime('now'))
);
