import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { db } from './db.js'
import { getItemCache, searchItems } from './nmsCache.js'

const app = express()
app.use(cors())
app.use(express.json())

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconCacheDir = path.join(__dirname, 'icon-cache')

const SystemSchema = z.object({
  name: z.string().min(1),
  galaxy: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  coordinates: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
})

const PlanetSchema = z.object({
  system_id: z.number().int(),
  name: z.string().min(1),
  planet_type: z.string().optional().nullable(),
  weather: z.string().optional().nullable(),
  sentinels: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/icons', express.static(iconCacheDir, {
  fallthrough: false,
  maxAge: '1d'
}))

// List systems
app.get('/api/systems', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, galaxy, region, coordinates, notes
    FROM systems
    ORDER BY name
  `).all()
  res.json(rows)
})

// List planets (optionally filtered by system)
app.get('/api/planets', (req, res) => {
  const systemId = req.query.systemId ? Number(req.query.systemId) : null
  const rows = systemId
    ? db.prepare(`
        SELECT p.*, s.name AS system_name
        FROM planets p
        JOIN systems s ON s.id = p.system_id
        WHERE p.system_id = ?
        ORDER BY p.name
      `).all(systemId)
    : db.prepare(`
        SELECT p.*, s.name AS system_name
        FROM planets p
        JOIN systems s ON s.id = p.system_id
        ORDER BY s.name, p.name
      `).all()
  res.json(rows)
})

// Autocomplete from NMS data
app.get('/api/nms/items', async (req, res) => {
  const q = String(req.query.q || '')
  const results = await searchItems(q, 25)
  res.json(results)
})

// Create system
app.post('/api/systems', (req, res) => {
  const data = SystemSchema.parse(req.body)
  const stmt = db.prepare(`
    INSERT INTO systems (name, galaxy, region, coordinates, notes)
    VALUES (@name, @galaxy, @region, @coordinates, @notes)
  `)
  const info = stmt.run(data)
  res.json({ id: info.lastInsertRowid })
})

// Delete system (cascades to planets/resources)
app.delete('/api/systems/:systemId', (req, res) => {
  const systemId = Number(req.params.systemId)
  if (!Number.isInteger(systemId)) return res.status(400).json({ error: 'Invalid system id' })

  db.prepare('DELETE FROM systems WHERE id = ?').run(systemId)
  res.json({ ok: true })
})

// Create planet
app.post('/api/planets', (req, res) => {
  const data = PlanetSchema.parse(req.body)
  const stmt = db.prepare(`
    INSERT INTO planets (system_id, name, planet_type, weather, sentinels, notes)
    VALUES (@system_id, @name, @planet_type, @weather, @sentinels, @notes)
  `)
  const info = stmt.run(data)
  res.json({ id: info.lastInsertRowid })
})

// Delete planet
app.delete('/api/planets/:planetId', (req, res) => {
  const planetId = Number(req.params.planetId)
  if (!Number.isInteger(planetId)) return res.status(400).json({ error: 'Invalid planet id' })

  db.prepare('DELETE FROM planets WHERE id = ?').run(planetId)
  res.json({ ok: true })
})

// List settlements (optionally filtered by planet)
app.get('/api/settlements', (req, res) => {
  const planetId = req.query.planetId ? Number(req.query.planetId) : null
  const rows = planetId
    ? db.prepare(`
        SELECT st.*, p.name AS planet_name, s.name AS system_name
        FROM settlements st
        JOIN planets p ON p.id = st.planet_id
        JOIN systems s ON s.id = p.system_id
        WHERE st.planet_id = ?
        ORDER BY st.name
      `).all(planetId)
    : db.prepare(`
        SELECT st.*, p.name AS planet_name, s.name AS system_name
        FROM settlements st
        JOIN planets p ON p.id = st.planet_id
        JOIN systems s ON s.id = p.system_id
        ORDER BY s.name, p.name, st.name
      `).all()
  res.json(rows)
})

// Create settlement
app.post('/api/settlements', (req, res) => {
  const SettlementSchema = z.object({
    planet_id: z.number().int(),
    name: z.string().min(1),
    settlement_type: z.string().optional().nullable(),
    coordinates: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
  })
  const data = SettlementSchema.parse(req.body)
  const stmt = db.prepare(`
    INSERT INTO settlements (planet_id, name, settlement_type, coordinates, notes)
    VALUES (@planet_id, @name, @settlement_type, @coordinates, @notes)
  `)
  const info = stmt.run(data)
  res.json({ id: info.lastInsertRowid })
})

// Delete settlement
app.delete('/api/settlements/:settlementId', (req, res) => {
  const settlementId = Number(req.params.settlementId)
  if (!Number.isInteger(settlementId)) return res.status(400).json({ error: 'Invalid settlement id' })

  db.prepare('DELETE FROM settlements WHERE id = ?').run(settlementId)
  res.json({ ok: true })
})

// Add/update a resource on a settlement (resource auto-created if missing)
app.put('/api/settlements/:settlementId/resources', (req, res) => {
  const settlementId = Number(req.params.settlementId)

  const Body = z.object({
    resource_name: z.string().min(1),
    nms_item_id: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    quantity: z.string().optional().nullable(),
    hotspot_type: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
  })

  const data = Body.parse(req.body)

  const upsertResource = db.prepare(`
    INSERT INTO resources (name, nms_item_id, category)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      nms_item_id = COALESCE(excluded.nms_item_id, resources.nms_item_id),
      category = COALESCE(excluded.category, resources.category)
  `)

  const getResId = db.prepare(`SELECT id FROM resources WHERE name = ?`)
  const upsertLink = db.prepare(`
    INSERT INTO settlement_resources (settlement_id, resource_id, quantity, hotspot_type, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(settlement_id, resource_id) DO UPDATE SET
      quantity = excluded.quantity,
      hotspot_type = excluded.hotspot_type,
      notes = excluded.notes
  `)

  const tx = db.transaction(() => {
    upsertResource.run(data.resource_name, data.nms_item_id ?? null, data.category ?? null)
    const row = getResId.get(data.resource_name)
    upsertLink.run(settlementId, row.id, data.quantity ?? null, data.hotspot_type ?? null, data.notes ?? null)
  })

  tx()
  res.json({ ok: true })
})

// Delete a resource from a settlement
app.delete('/api/settlements/:settlementId/resources/:resourceId', (req, res) => {
  const settlementId = Number(req.params.settlementId)
  const resourceId = Number(req.params.resourceId)
  if (!Number.isInteger(settlementId) || !Number.isInteger(resourceId)) {
    return res.status(400).json({ error: 'Invalid settlement or resource id' })
  }

  db.prepare('DELETE FROM settlement_resources WHERE settlement_id = ? AND resource_id = ?').run(settlementId, resourceId)
  res.json({ ok: true })
})

// Delete a resource from a planet
app.delete('/api/planets/:planetId/resources/:resourceId', (req, res) => {
  const planetId = Number(req.params.planetId)
  const resourceId = Number(req.params.resourceId)
  if (!Number.isInteger(planetId) || !Number.isInteger(resourceId)) {
    return res.status(400).json({ error: 'Invalid planet or resource id' })
  }

  db.prepare('DELETE FROM planet_resources WHERE planet_id = ? AND resource_id = ?').run(planetId, resourceId)
  res.json({ ok: true })
})

// Delete a resource from a system
app.delete('/api/systems/:systemId/resources/:resourceId', (req, res) => {
  const systemId = Number(req.params.systemId)
  const resourceId = Number(req.params.resourceId)
  if (!Number.isInteger(systemId) || !Number.isInteger(resourceId)) {
    return res.status(400).json({ error: 'Invalid system or resource id' })
  }

  db.prepare('DELETE FROM system_resources WHERE system_id = ? AND resource_id = ?').run(systemId, resourceId)
  res.json({ ok: true })
})

// Add/update a resource on a planet (resource auto-created if missing)
app.put('/api/planets/:planetId/resources', (req, res) => {
  const planetId = Number(req.params.planetId)

  const Body = z.object({
    resource_name: z.string().min(1),
    nms_item_id: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    quantity: z.string().optional().nullable(),
    hotspot_type: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
  })

  const data = Body.parse(req.body)

  const upsertResource = db.prepare(`
    INSERT INTO resources (name, nms_item_id, category)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      nms_item_id = COALESCE(excluded.nms_item_id, resources.nms_item_id),
      category = COALESCE(excluded.category, resources.category)
  `)

  const getResId = db.prepare(`SELECT id FROM resources WHERE name = ?`)
  const upsertLink = db.prepare(`
    INSERT INTO planet_resources (planet_id, resource_id, quantity, hotspot_type, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(planet_id, resource_id) DO UPDATE SET
      quantity = excluded.quantity,
      hotspot_type = excluded.hotspot_type,
      notes = excluded.notes
  `)

  const tx = db.transaction(() => {
    upsertResource.run(data.resource_name, data.nms_item_id ?? null, data.category ?? null)
    const row = getResId.get(data.resource_name)
    upsertLink.run(planetId, row.id, data.quantity ?? null, data.hotspot_type ?? null, data.notes ?? null)
  })

  tx()
  res.json({ ok: true })
})

// Add/update a resource on a system (resource auto-created if missing)
app.put('/api/systems/:systemId/resources', (req, res) => {
  const systemId = Number(req.params.systemId)

  const Body = z.object({
    resource_name: z.string().min(1),
    nms_item_id: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    quantity: z.string().optional().nullable(),
    hotspot_type: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
  })

  const data = Body.parse(req.body)

  const upsertResource = db.prepare(`
    INSERT INTO resources (name, nms_item_id, category)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      nms_item_id = COALESCE(excluded.nms_item_id, resources.nms_item_id),
      category = COALESCE(excluded.category, resources.category)
  `)

  const getResId = db.prepare(`SELECT id FROM resources WHERE name = ?`)
  const upsertLink = db.prepare(`
    INSERT INTO system_resources (system_id, resource_id, quantity, hotspot_type, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(system_id, resource_id) DO UPDATE SET
      quantity = excluded.quantity,
      hotspot_type = excluded.hotspot_type,
      notes = excluded.notes
  `)

  const tx = db.transaction(() => {
    upsertResource.run(data.resource_name, data.nms_item_id ?? null, data.category ?? null)
    const row = getResId.get(data.resource_name)
    upsertLink.run(systemId, row.id, data.quantity ?? null, data.hotspot_type ?? null, data.notes ?? null)
  })

  tx()
  res.json({ ok: true })
})

// Search across everything
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const like = q ? `%${q}%` : '%'

  const systems = db.prepare(`
    SELECT DISTINCT s.* FROM systems s
    WHERE s.name LIKE ? OR s.galaxy LIKE ? OR s.region LIKE ? OR s.coordinates LIKE ? OR s.notes LIKE ?
    UNION
    SELECT DISTINCT s.* FROM systems s
    JOIN system_resources sr ON sr.system_id = s.id
    JOIN resources r ON r.id = sr.resource_id
    WHERE r.name LIKE ? OR sr.notes LIKE ?
    ORDER BY name
    LIMIT 50
  `).all(like, like, like, like, like, like, like)

  const planets = db.prepare(`
    SELECT p.*, s.name AS system_name
    FROM planets p
    JOIN systems s ON s.id = p.system_id
    WHERE p.name LIKE ? OR p.planet_type LIKE ? OR p.weather LIKE ? OR p.sentinels LIKE ? OR p.notes LIKE ?
       OR s.name LIKE ?
    UNION
    SELECT DISTINCT p.*, s.name AS system_name
    FROM planets p
    JOIN systems s ON s.id = p.system_id
    JOIN planet_resources pr ON pr.planet_id = p.id
    JOIN resources r ON r.id = pr.resource_id
    WHERE r.name LIKE ? OR pr.notes LIKE ?
    ORDER BY system_name, name
    LIMIT 100
  `).all(like, like, like, like, like, like, like, like)

  const planetResources = db.prepare(`
    SELECT r.id AS resource_id, r.name AS resource_name, r.nms_item_id, r.category,
           s.id AS system_id, s.name AS system_name, p.id AS planet_id, p.name AS planet_name,
           pr.quantity, pr.hotspot_type, pr.notes,
           'planet' AS location_type
    FROM planet_resources pr
    JOIN resources r ON r.id = pr.resource_id
    JOIN planets p ON p.id = pr.planet_id
    JOIN systems s ON s.id = p.system_id
    WHERE r.name LIKE ? OR COALESCE(pr.notes, '') LIKE ? OR p.name LIKE ? OR s.name LIKE ?
    ORDER BY r.name
    LIMIT 200
  `).all(like, like, like, like)

  const systemResources = db.prepare(`
    SELECT r.id AS resource_id, r.name AS resource_name, r.nms_item_id, r.category,
           s.id AS system_id, s.name AS system_name, NULL AS planet_id, NULL AS planet_name,
           sr.quantity, sr.hotspot_type, sr.notes,
           'system' AS location_type
    FROM system_resources sr
    JOIN resources r ON r.id = sr.resource_id
    JOIN systems s ON s.id = sr.system_id
    WHERE r.name LIKE ? OR COALESCE(sr.notes, '') LIKE ? OR s.name LIKE ?
    ORDER BY r.name
    LIMIT 200
  `).all(like, like, like)

  const settlements = db.prepare(`
    SELECT st.*, p.name AS planet_name, s.name AS system_name
    FROM settlements st
    JOIN planets p ON p.id = st.planet_id
    JOIN systems s ON s.id = p.system_id
    WHERE st.name LIKE ? OR st.settlement_type LIKE ? OR st.coordinates LIKE ? OR st.notes LIKE ?
       OR p.name LIKE ? OR s.name LIKE ?
    ORDER BY s.name, p.name, st.name
    LIMIT 100
  `).all(like, like, like, like, like, like)

  const settlementResources = db.prepare(`
    SELECT r.id AS resource_id, r.name AS resource_name, r.nms_item_id, r.category,
           s.id AS system_id, s.name AS system_name, p.id AS planet_id, p.name AS planet_name,
           st.id AS settlement_id, st.name AS settlement_name,
           sr.quantity, sr.hotspot_type, sr.notes,
           'settlement' AS location_type
    FROM settlement_resources sr
    JOIN resources r ON r.id = sr.resource_id
    JOIN settlements st ON st.id = sr.settlement_id
    JOIN planets p ON p.id = st.planet_id
    JOIN systems s ON s.id = p.system_id
    WHERE r.name LIKE ? OR COALESCE(sr.notes, '') LIKE ? OR st.name LIKE ? OR p.name LIKE ? OR s.name LIKE ?
    ORDER BY r.name
    LIMIT 200
  `).all(like, like, like, like, like)

  const rawResources = [...planetResources, ...systemResources, ...settlementResources]

  let resources = rawResources
  if (rawResources.length) {
    const cache = await getItemCache()
    const byId = new Map()
    const byName = new Map()
    for (const item of cache) {
      if (item.id) byId.set(String(item.id), item)
      if (item.name) byName.set(item.name.toLowerCase(), item)
    }

    resources = rawResources.map(row => {
      const match = (row.nms_item_id && byId.get(String(row.nms_item_id)))
        || byName.get(row.resource_name.toLowerCase())
      return {
        ...row,
        category: row.category || match?.category || null,
        iconUrl: match?.iconUrl || null,
        iconColor: match?.iconColor || null
      }
    })
  }

  resources.sort((a, b) => a.resource_name.localeCompare(b.resource_name))

  res.json({ systems, planets, settlements, resources })
})

const port = process.env.PORT || 3789
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
