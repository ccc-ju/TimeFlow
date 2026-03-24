import type { WallpaperPayload } from '@/types/timeflow'

import { getSetting, setSetting } from './sqlite'
import { toDayKey } from '@/utils/date'

export const DEFAULT_WALLPAPER = '/static/default-wallpaper.svg'

const CACHE_KEY = 'bing_wallpaper'
const BING_ENDPOINTS = [
  'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',
  'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN'
]

function parseCachedWallpaper(raw: string | null) {
  if (!raw) return null

  try {
    return JSON.parse(raw) as WallpaperPayload
  } catch (error) {
    console.debug('wallpaper cache parse skipped', error)
    return null
  }
}

function normalizeBingDate(input?: string) {
  if (!input) return ''
  const value = `${input}`.slice(0, 8)
  if (!/^\d{8}$/.test(value)) return ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function dayDistance(left: string, right: string) {
  if (!left || !right) return Number.POSITIVE_INFINITY
  const leftTime = new Date(`${left}T12:00:00`).getTime()
  const rightTime = new Date(`${right}T12:00:00`).getTime()
  return Math.round(Math.abs(leftTime - rightTime) / (24 * 60 * 60 * 1000))
}

function isWallpaperPayloadFresh(payload: WallpaperPayload | null, today: string) {
  if (!payload) return false
  if (payload.date !== today) return false
  if (!payload.sourceDate) return false
  return dayDistance(payload.sourceDate, today) <= 1
}

function resolveBingImageUrl(image?: { url?: string; urlbase?: string }) {
  if (image?.url) {
    return image.url.startsWith('http') ? image.url : `https://cn.bing.com${image.url}`
  }

  if (image?.urlbase) {
    return `https://cn.bing.com${image.urlbase}_UHD.jpg`
  }

  return DEFAULT_WALLPAPER
}

async function requestBingWallpaper(today: string) {
  for (const endpoint of BING_ENDPOINTS) {
    try {
      const response = await uni.request({
        url: `${endpoint}&_=${Date.now()}`,
        timeout: 6000,
        header: {
          'cache-control': 'no-cache'
        }
      })
      const data = response.data as {
        images?: Array<{
          url?: string
          urlbase?: string
          title?: string
          copyright?: string
          startdate?: string
          fullstartdate?: string
        }>
      }
      const image = data.images?.[0]
      const sourceDate = normalizeBingDate(image?.startdate || image?.fullstartdate)

      if (sourceDate && dayDistance(sourceDate, today) > 1) {
        console.warn('bing wallpaper skipped due to stale source date', sourceDate, today, endpoint)
        continue
      }

      const payload: WallpaperPayload = {
        date: today,
        sourceDate: sourceDate || today,
        url: resolveBingImageUrl(image),
        title: image?.title || image?.copyright || 'Bing Daily'
      }

      return payload
    } catch (error) {
      console.warn('bing wallpaper request skipped', endpoint, error)
    }
  }

  return null
}

export async function fetchDailyWallpaper() {
  const today = toDayKey()
  const cached = parseCachedWallpaper(await getSetting(CACHE_KEY))

  if (isWallpaperPayloadFresh(cached, today)) {
    return cached
  }

  const freshWallpaper = await requestBingWallpaper(today)
  if (freshWallpaper) {
    await setSetting(CACHE_KEY, JSON.stringify(freshWallpaper))
    return freshWallpaper
  }

  if (cached) {
    return cached
  }

  const fallback: WallpaperPayload = {
    date: '',
    sourceDate: '',
    url: DEFAULT_WALLPAPER,
    title: 'Fallback Wallpaper'
  }

  try {
    await setSetting(CACHE_KEY, JSON.stringify(fallback))
  } catch (error) {
    console.warn('wallpaper fallback cache skipped', error)
  }

  return fallback
}
