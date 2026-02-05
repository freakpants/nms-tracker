import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { getItemCache } from './nmsCache.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconCacheDir = path.join(__dirname, 'icon-cache')
const iconCdnBase = 'https://cdn.nmsassistant.com/'
const concurrency = 8

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch (err) {
    return false
  }
}

async function downloadIcon(iconPath) {
  const localPath = path.join(iconCacheDir, iconPath)
  if (await fileExists(localPath)) return { iconPath, skipped: true }

  const url = `${iconCdnBase}${iconPath}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'nms-tracker-icon-cache/1.0'
    }
  })
  if (!response.ok) return { iconPath, skipped: false, error: response.status }

  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(localPath), { recursive: true })
  await fs.writeFile(localPath, buffer)
  return { iconPath, skipped: false }
}

async function run() {
  await fs.mkdir(iconCacheDir, { recursive: true })

  const items = await getItemCache()
  const icons = [...new Set(items.map(item => item.icon).filter(Boolean))]

  let completed = 0
  let skipped = 0
  let failed = 0
  const errorSamples = []

  let index = 0
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (index < icons.length) {
      const iconPath = icons[index]
      index += 1
      try {
        const result = await downloadIcon(iconPath)
        if (result.skipped) skipped += 1
        else if (result.error) {
          failed += 1
          if (errorSamples.length < 5) {
            errorSamples.push({ iconPath, error: result.error })
          }
        } else completed += 1
      } catch (err) {
        failed += 1
        if (errorSamples.length < 5) {
          errorSamples.push({ iconPath, error: String(err?.message || err) })
        }
      }
    }
  })

  await Promise.all(workers)
  console.log(`Icons cached: ${completed}, skipped: ${skipped}, failed: ${failed}`)
  if (errorSamples.length) {
    console.log('Sample errors:', errorSamples)
  }
}

run().catch(err => {
  console.error('Icon cache failed', err)
  process.exit(1)
})
