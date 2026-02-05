import { GameItemService } from 'assistantapps-nomanssky-info'

let cache = null
let cacheAt = 0

export async function getItemCache() {
  const now = Date.now()
  if (cache && (now - cacheAt) < 1000 * 60 * 60) return cache

  const svc = new GameItemService()
  const allItems = await svc.getAllItemDetails() // from package readme example :contentReference[oaicite:1]{index=1}

  const iconBase = 'https://cdn.nmsassistant.com/icons/'

  cache = allItems.map(itm => ({
    name: itm?.Name ?? '',
    id: itm?.Id ?? itm?.ID ?? null,
    category: itm?.Category ?? itm?.Type ?? null,
    icon: itm?.Icon ?? null,
    iconUrl: itm?.CdnUrl || (itm?.Icon ? `${iconBase}${itm.Icon}` : null)
  })).filter(x => x.name)

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
