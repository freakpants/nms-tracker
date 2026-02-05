<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import axios from 'axios'

const apiBase = 'http://localhost:3789'

const q = ref('')
const results = ref({ systems: [], planets: [], resources: [] })
const loading = ref(false)

const systems = ref([])
const planets = ref([])

const systemForm = ref({
  name: '',
  galaxy: '',
  region: '',
  coordinates: '',
  notes: ''
})

const planetForm = ref({
  system_id: '',
  name: '',
  planet_type: '',
  weather: '',
  sentinels: '',
  notes: ''
})

const resourceForm = ref({
  system_id: '',
  planet_id: '',
  resource_name: '',
  nms_item_id: '',
  category: '',
  icon_path: '',
  icon_url: '',
  quantity: '',
  hotspot_type: '',
  notes: ''
})

const resourceMatches = ref([])
const resourceLoading = ref(false)
const lastMatchedName = ref('')

const systemError = ref('')
const planetError = ref('')
const resourceError = ref('')

const systemResourcesByName = computed(() => {
  const byName = {}
  for (const resource of results.value.resources || []) {
    if (resource.location_type !== 'system') continue
    const key = resource.system_name || ''
    if (!byName[key]) byName[key] = []
    byName[key].push(resource)
  }
  for (const key of Object.keys(byName)) {
    byName[key].sort((a, b) => a.resource_name.localeCompare(b.resource_name))
  }
  return byName
})

const nonSystemResources = computed(() =>
  (results.value.resources || []).filter(resource => resource.location_type !== 'system')
)

const filteredPlanets = computed(() => {
  const systemId = Number(resourceForm.value.system_id || 0)
  if (!systemId) return planets.value
  return planets.value.filter(p => p.system_id === systemId)
})

async function loadSystems() {
  const { data } = await axios.get(`${apiBase}/api/systems`)
  systems.value = data
}

async function loadPlanets(systemId) {
  const params = systemId ? { systemId } : undefined
  const { data } = await axios.get(`${apiBase}/api/planets`, { params })
  planets.value = data
}

async function deleteSystem(id, name) {
  if (!window.confirm(`Delete system "${name}" and all its planets/resources?`)) return
  await axios.delete(`${apiBase}/api/systems/${id}`)
  await loadSystems()
  await loadPlanets()
  if (q.value.trim()) await doSearch()
}

async function deletePlanet(id, name) {
  if (!window.confirm(`Delete planet "${name}" and its resources?`)) return
  await axios.delete(`${apiBase}/api/planets/${id}`)
  await loadPlanets()
  if (q.value.trim()) await doSearch()
}

async function submitSystem() {
  systemError.value = ''
  const payload = {
    name: systemForm.value.name.trim(),
    galaxy: systemForm.value.galaxy.trim() || null,
    region: systemForm.value.region.trim() || null,
    coordinates: systemForm.value.coordinates.trim() || null,
    notes: systemForm.value.notes.trim() || null
  }
  if (!payload.name) {
    systemError.value = 'System name is required.'
    return
  }
  try {
    await axios.post(`${apiBase}/api/systems`, payload)
    systemForm.value = { name: '', galaxy: '', region: '', coordinates: '', notes: '' }
    await loadSystems()
    await doSearch()
  } catch (err) {
    systemError.value = 'Could not save system. Check required fields and try again.'
  }
}

async function submitPlanet() {
  planetError.value = ''
  const payload = {
    system_id: Number(planetForm.value.system_id),
    name: planetForm.value.name.trim(),
    planet_type: planetForm.value.planet_type.trim() || null,
    weather: planetForm.value.weather.trim() || null,
    sentinels: planetForm.value.sentinels.trim() || null,
    notes: planetForm.value.notes.trim() || null
  }
  if (!payload.system_id || !payload.name) {
    planetError.value = 'System and planet name are required.'
    return
  }
  try {
    await axios.post(`${apiBase}/api/planets`, payload)
    planetForm.value = { system_id: '', name: '', planet_type: '', weather: '', sentinels: '', notes: '' }
    await loadPlanets()
    await doSearch()
  } catch (err) {
    planetError.value = 'Could not save planet. Check required fields and try again.'
  }
}

async function submitResource() {
  resourceError.value = ''
  const payload = {
    resource_name: resourceForm.value.resource_name.trim(),
    nms_item_id: resourceForm.value.nms_item_id || null,
    category: resourceForm.value.category || null,
    quantity: resourceForm.value.quantity.trim() || null,
    hotspot_type: resourceForm.value.hotspot_type.trim() || null,
    notes: resourceForm.value.notes.trim() || null
  }
  const planetId = Number(resourceForm.value.planet_id)
  const systemId = Number(resourceForm.value.system_id)
  if (!payload.resource_name || (!planetId && !systemId)) {
    resourceError.value = 'Select a system or planet and enter a resource name.'
    return
  }
  try {
    if (planetId) {
      await axios.put(`${apiBase}/api/planets/${planetId}/resources`, payload)
    } else {
      await axios.put(`${apiBase}/api/systems/${systemId}/resources`, payload)
    }
    resourceForm.value = {
      system_id: resourceForm.value.system_id,
      planet_id: resourceForm.value.planet_id,
      resource_name: '',
      nms_item_id: '',
      category: '',
      icon_path: '',
      icon_url: '',
      quantity: '',
      hotspot_type: '',
      notes: ''
    }
    resourceMatches.value = []
    lastMatchedName.value = ''
    await doSearch()
  } catch (err) {
    resourceError.value = 'Could not save resource. Check required fields and try again.'
  }
}

async function doSearch() {
  const query = q.value.trim()
  loading.value = true
  try {
    const params = query ? { q: query } : undefined
    const { data } = await axios.get(`${apiBase}/api/search`, { params })
    results.value = data
  } finally {
    loading.value = false
  }
}

let searchTimer = null
watch(q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(doSearch, 200)
})

let resourceTimer = null
watch(
  () => resourceForm.value.resource_name,
  () => {
    clearTimeout(resourceTimer)
    const needle = resourceForm.value.resource_name.trim()
    if (!needle) {
      resourceMatches.value = []
      resourceForm.value.nms_item_id = ''
      resourceForm.value.category = ''
      resourceForm.value.icon_url = ''
      lastMatchedName.value = ''
      return
    }
    if (needle !== lastMatchedName.value) {
      resourceForm.value.nms_item_id = ''
      resourceForm.value.category = ''
      resourceForm.value.icon_url = ''
    }
    resourceTimer = setTimeout(async () => {
      resourceLoading.value = true
      try {
        const { data } = await axios.get(`${apiBase}/api/nms/items`, { params: { q: needle } })
        resourceMatches.value = data
      } finally {
        resourceLoading.value = false
      }
    }, 200)
  }
)

watch(
  () => resourceForm.value.system_id,
  () => {
    resourceForm.value.planet_id = ''
  }
)

function applyResourceMatch(match) {
  resourceForm.value.resource_name = match.name
  resourceForm.value.nms_item_id = match.id || ''
  resourceForm.value.category = match.category || ''
  resourceForm.value.icon_path = match.icon || ''
  resourceForm.value.icon_url = match.iconUrl || ''
  resourceMatches.value = []
  lastMatchedName.value = match.name
}

function handleMatchIconError(match) {
  match.iconUrl = ''
}

function handleResourceIconError(resource) {
  resource.iconUrl = ''
}

function handleSelectedIconError() {
  resourceForm.value.icon_url = ''
}

function resolveIconUrl(url) {
  if (!url) return ''
  const cdnPrefix = 'https://cdn.nmsassistant.com/icons/'
  if (url.startsWith(cdnPrefix)) {
    return `${apiBase}/api/icons/${url.slice(cdnPrefix.length)}`
  }
  if (url.startsWith('/api/icons/')) return `${apiBase}${url}`
  if (url.startsWith('http')) return url
  return `${apiBase}${url}`
}

function getSystemResources(systemName) {
  return systemResourcesByName.value[systemName] || []
}

onMounted(async () => {
  await loadSystems()
  await loadPlanets()
  await doSearch()
})
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <p class="kicker">No Man's Sky</p>
        <h1>Starmap Resource Log</h1>
        <p class="lede">Track systems, planets, and harvestable resources in one place.</p>
      </div>
      <div class="hero-chip">
        <span>Live cache</span>
        <strong>NMS item catalog</strong>
      </div>
    </header>

    <section class="grid">
      <article class="card">
        <h2>Add System</h2>
        <form class="form" @submit.prevent="submitSystem">
          <div class="field">
            <label>System name</label>
            <input v-model="systemForm.name" placeholder="Ikarus Prime" />
          </div>
          <div class="row">
            <div class="field">
              <label>Galaxy</label>
              <input v-model="systemForm.galaxy" placeholder="Euclid" />
            </div>
            <div class="field">
              <label>Region</label>
              <input v-model="systemForm.region" placeholder="Kepis Conflux" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Coordinates</label>
              <input v-model="systemForm.coordinates" placeholder="0F23:0080:0D32:00A4" />
            </div>
            <div class="field">
              <label>Notes</label>
              <input v-model="systemForm.notes" placeholder="Trade economy, Gek." />
            </div>
          </div>
          <button class="primary" type="submit">Save system</button>
          <p v-if="systemError" class="form-error">{{ systemError }}</p>
        </form>
      </article>

      <article class="card">
        <h2>Add Planet</h2>
        <form class="form" @submit.prevent="submitPlanet">
          <div class="field">
            <label>System</label>
            <select v-model="planetForm.system_id">
              <option value="">Select a system</option>
              <option v-for="s in systems" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Planet name</label>
            <input v-model="planetForm.name" placeholder="Hysper VI" />
          </div>
          <div class="row">
            <div class="field">
              <label>Planet type</label>
              <input v-model="planetForm.planet_type" placeholder="Bountiful" />
            </div>
            <div class="field">
              <label>Weather</label>
              <input v-model="planetForm.weather" placeholder="Balmy" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Sentinels</label>
              <input v-model="planetForm.sentinels" placeholder="Sparse" />
            </div>
            <div class="field">
              <label>Notes</label>
              <input v-model="planetForm.notes" placeholder="Ancient bones" />
            </div>
          </div>
          <button class="primary" type="submit">Save planet</button>
          <p v-if="planetError" class="form-error">{{ planetError }}</p>
        </form>
      </article>

      <article class="card">
        <h2>Add Resource</h2>
        <form class="form" @submit.prevent="submitResource">
          <div class="row">
            <div class="field">
              <label>System</label>
              <select v-model="resourceForm.system_id">
                <option value="">All systems</option>
                <option v-for="s in systems" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>
            <div class="field">
              <label>Planet</label>
              <select v-model="resourceForm.planet_id">
                <option value="">Select a planet</option>
                <option v-for="p in filteredPlanets" :key="p.id" :value="p.id">
                  {{ p.system_name ? `${p.name} (${p.system_name})` : p.name }}
                </option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Resource</label>
            <input v-model="resourceForm.resource_name" placeholder="Activated Indium" />
            <div v-if="resourceLoading" class="hint">Looking up catalog…</div>
            <div v-if="resourceMatches.length" class="dropdown">
              <button
                v-for="match in resourceMatches"
                :key="match.id || match.name"
                class="dropdown-item"
                type="button"
                @click="applyResourceMatch(match)"
              >
                <span class="dropdown-main">
                  <span v-if="match.iconUrl" class="dropdown-icon">
                    <img :src="resolveIconUrl(match.iconUrl)" :alt="match.name" @error="handleMatchIconError(match)" />
                  </span>
                  <span v-else class="dropdown-fallback">{{ match.name.slice(0, 2).toUpperCase() }}</span>
                  <span>{{ match.name }}</span>
                </span>
                <span class="muted">{{ match.category || 'Unknown' }}</span>
              </button>
            </div>
            <div v-if="resourceForm.icon_url" class="resource-preview">
              <img :src="resolveIconUrl(resourceForm.icon_url)" :alt="resourceForm.resource_name" @error="handleSelectedIconError" />
              <span>Catalog icon</span>
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Quantity</label>
              <input v-model="resourceForm.quantity" placeholder="S-class, 40k/hr" />
            </div>
            <div class="field">
              <label>Hotspot type</label>
              <input v-model="resourceForm.hotspot_type" placeholder="Power / Mineral / Gas" />
            </div>
          </div>
          <div class="field">
            <label>Notes</label>
            <input v-model="resourceForm.notes" placeholder="Portal glyphs nearby" />
          </div>
          <div class="row meta">
            <div>
              <span class="muted">Catalog ID</span>
              <strong>{{ resourceForm.nms_item_id || '—' }}</strong>
            </div>
            <div>
              <span class="muted">Category</span>
              <strong>{{ resourceForm.category || '—' }}</strong>
            </div>
          </div>
          <button class="primary" type="submit">Save resource</button>
          <p v-if="resourceError" class="form-error">{{ resourceError }}</p>
        </form>
      </article>
    </section>

    <section class="search">
      <h2>Search the log</h2>
      <input
        v-model="q"
        class="search-input"
        placeholder="Search systems, planets, resources…"
      />
      <p v-if="loading" class="hint">Searching…</p>

      <div class="results">
        <div class="result-card">
          <h3>Systems</h3>
          <div v-if="results.systems.length === 0" class="empty">No matches</div>
          <ul v-else>
            <li v-for="s in results.systems" :key="s.id" class="list-row system-row">
              <div class="system-main">
                <div>
                  <strong>{{ s.name }}</strong>
                  <span v-if="s.galaxy"> — {{ s.galaxy }}</span>
                  <span v-if="s.coordinates"> ({{ s.coordinates }})</span>
                </div>
                <ul v-if="getSystemResources(s.name).length" class="resource-list system-resource-list">
                  <li
                    v-for="(r, idx) in getSystemResources(s.name)"
                    :key="`${s.id}-${r.resource_name}-${idx}`"
                    class="resource-row"
                  >
                    <div class="resource-card">
                      <span class="resource-card-title">{{ r.resource_name }}</span>
                      <div class="resource-card-icon" :style="{ background: r.iconColor || '#111' }">
                        <img v-if="r.iconUrl" :src="resolveIconUrl(r.iconUrl)" :alt="r.resource_name" @error="handleResourceIconError(r)" />
                        <span v-else>{{ r.resource_name.slice(0, 2).toUpperCase() }}</span>
                      </div>
                    </div>
                    <div class="resource-body">
                      <div class="resource-title">
                        <strong>{{ r.resource_name }}</strong>
                        <span v-if="r.category" class="resource-tag">{{ r.category }}</span>
                      </div>
                      <div class="resource-meta">
                        <span v-if="r.planet_name">{{ r.system_name }} / {{ r.planet_name }}</span>
                        <span v-else>System: {{ r.system_name }}</span>
                      </div>
                      <div v-if="r.notes" class="note">{{ r.notes }}</div>
                    </div>
                    <div class="resource-badges">
                      <span v-if="r.location_type === 'system'" class="resource-pill">System</span>
                      <span v-if="r.hotspot_type" class="resource-pill">{{ r.hotspot_type }}</span>
                      <span v-if="r.quantity" class="resource-pill">{{ r.quantity }}</span>
                    </div>
                  </li>
                </ul>
              </div>
              <button class="danger" type="button" @click="deleteSystem(s.id, s.name)">Delete</button>
            </li>
          </ul>
        </div>

        <div class="result-card">
          <h3>Planets</h3>
          <div v-if="results.planets.length === 0" class="empty">No matches</div>
          <ul v-else>
            <li v-for="p in results.planets" :key="p.id" class="list-row">
              <div>
                <strong>{{ p.planet_name || p.name }}</strong>
                <span> — {{ p.system_name }}</span>
                <span v-if="p.planet_type"> · {{ p.planet_type }}</span>
              </div>
              <button class="danger" type="button" @click="deletePlanet(p.id, p.planet_name || p.name)">Delete</button>
            </li>
          </ul>
        </div>

        <div class="result-card">
          <h3>Resources</h3>
          <div v-if="nonSystemResources.length === 0" class="empty">No matches</div>
          <ul v-else class="resource-list resource-list-scroll">
            <li v-for="(r, idx) in nonSystemResources" :key="idx" class="resource-row">
              <div class="resource-card">
                <span class="resource-card-title">{{ r.resource_name }}</span>
                <div class="resource-card-icon" :style="{ background: r.iconColor || '#111' }">
                  <img v-if="r.iconUrl" :src="resolveIconUrl(r.iconUrl)" :alt="r.resource_name" @error="handleResourceIconError(r)" />
                  <span v-else>{{ r.resource_name.slice(0, 2).toUpperCase() }}</span>
                </div>
              </div>
              <div class="resource-body">
                <div class="resource-title">
                  <strong>{{ r.resource_name }}</strong>
                  <span v-if="r.category" class="resource-tag">{{ r.category }}</span>
                </div>
                <div class="resource-meta">
                  <span v-if="r.planet_name">{{ r.system_name }} / {{ r.planet_name }}</span>
                  <span v-else>System: {{ r.system_name }}</span>
                </div>
                <div v-if="r.notes" class="note">{{ r.notes }}</div>
              </div>
              <div class="resource-badges">
                <span v-if="r.location_type === 'system'" class="resource-pill">System</span>
                <span v-if="r.hotspot_type" class="resource-pill">{{ r.hotspot_type }}</span>
                <span v-if="r.quantity" class="resource-pill">{{ r.quantity }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </main>
</template>
