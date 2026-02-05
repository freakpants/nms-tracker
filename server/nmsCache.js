import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { GameItemService } from 'assistantapps-nomanssky-info'

let cache = null
let cacheAt = 0

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconCacheDir = path.join(__dirname, 'icon-cache')
const fallbackByGroup = {
  'Crafted Technology Component': 'products/1.png'
}

function toHexChannel(value) {
  const clamped = Math.max(0, Math.min(255, Math.round(value)))
  return clamped.toString(16).padStart(2, '0')
}

function normalizeColor(input) {
  if (!input) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('#') || trimmed.startsWith('rgb')) return trimmed
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`
    if (/^[0-9a-fA-F]{8}$/.test(trimmed)) return `#${trimmed}`
    return trimmed
  }
  if (typeof input === 'object') {
    const hex = input.Hex || input.hex
    if (hex) return normalizeColor(hex)

    const r = input.r ?? input.R ?? input.red ?? input.Red
    const g = input.g ?? input.G ?? input.green ?? input.Green
    const b = input.b ?? input.B ?? input.blue ?? input.Blue
    if (r === undefined || g === undefined || b === undefined) return null

    const scale = (value) => (value <= 1 ? value * 255 : value)
    return `#${toHexChannel(scale(r))}${toHexChannel(scale(g))}${toHexChannel(scale(b))}`
  }
  return null
}

export async function getItemCache() {
  const now = Date.now()
  if (cache && (now - cacheAt) < 1000 * 60 * 60) return cache

  const svc = new GameItemService()
  const allItems = await svc.getAllItemDetails() // from package readme example :contentReference[oaicite:1]{index=1}

  const iconBase = '/api/icons/'

  const iconPaths = [...new Set(allItems.map(itm => itm?.Icon).filter(Boolean))]
  const iconExists = new Map()
  await Promise.all(iconPaths.map(async iconPath => {
    try {
      await fs.access(path.join(iconCacheDir, iconPath))
      iconExists.set(iconPath, true)
    } catch (err) {
      iconExists.set(iconPath, false)
    }
  }))

  cache = allItems.map(itm => {
    const iconPath = itm?.Icon ?? null
    const group = itm?.Group ?? ''
    const fallbackPath = fallbackByGroup[group] || null
    const hasIcon = iconPath ? iconExists.get(iconPath) : false
    const hasFallback = fallbackPath ? iconExists.get(fallbackPath) : false
    const finalPath = hasIcon ? iconPath : (hasFallback ? fallbackPath : null)
    const iconColor = normalizeColor(
      itm?.Colour ?? itm?.Color ?? itm?.ColourHex ?? itm?.ColorHex ?? itm?.Colour?.Hex ?? itm?.Color?.Hex
    )

    return {
      name: itm?.Name ?? '',
      id: itm?.Id ?? itm?.ID ?? null,
      category: itm?.Category ?? itm?.Type ?? null,
      icon: iconPath,
      iconUrl: finalPath ? `${iconBase}${finalPath}` : null,
      iconColor
    }
  }).filter(x => x.name)

  cacheAt = now
  return cache
}

export async function searchItems(q, limit = 20) {
  const items = await getItemCache()
  const needle = (q || '').toLowerCase().trim()
  if (!needle) return []

  return items
    .filter(x => x.name.toLowerCase().includes(needle))
    .slice(0, limit)
}
