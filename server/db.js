import Database from 'better-sqlite3'

export const db = new Database('nms-tracker.sqlite')
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    galaxy TEXT,
    region TEXT,
    coordinates TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS planets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    planet_type TEXT,
    weather TEXT,
    sentinels TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(system_id) REFERENCES systems(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    nms_item_id TEXT,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS planet_resources (
    planet_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    quantity TEXT,
    hotspot_type TEXT,
    notes TEXT,
    PRIMARY KEY (planet_id, resource_id),
    FOREIGN KEY(planet_id) REFERENCES planets(id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_resources (
    system_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    quantity TEXT,
    hotspot_type TEXT,
    notes TEXT,
    PRIMARY KEY (system_id, resource_id),
    FOREIGN KEY(system_id) REFERENCES systems(id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    planet_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    settlement_type TEXT,
    coordinates TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(planet_id) REFERENCES planets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settlement_resources (
    settlement_id INTEGER NOT NULL,
    resource_id INTEGER NOT NULL,
    quantity TEXT,
    hotspot_type TEXT,
    notes TEXT,
    PRIMARY KEY (settlement_id, resource_id),
    FOREIGN KEY(settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_systems_name ON systems(name);
  CREATE INDEX IF NOT EXISTS idx_planets_name ON planets(name);
  CREATE INDEX IF NOT EXISTS idx_resources_name ON resources(name);
  CREATE INDEX IF NOT EXISTS idx_settlements_planet ON settlements(planet_id);
  CREATE INDEX IF NOT EXISTS idx_settlement_resources ON settlement_resources(settlement_id);
`)
