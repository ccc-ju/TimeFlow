import type { Locale } from '@/types/timeflow'

export interface MotivationQuote {
  content: string
  author: string
  provider: 'hitokoto' | 'zenquotes' | 'local'
}

const fallbackQuotes: Record<Locale, MotivationQuote[]> = {
  'zh-CN': [
    { content: '你认真走过的每一分钟，都会在未来回过头来照亮你。', author: 'TimeFlow', provider: 'local' },
    { content: '把今天做好，不必一次追上所有明天。', author: 'TimeFlow', provider: 'local' },
    { content: '专注不是一下子变强，而是一次次把注意力带回来。', author: 'TimeFlow', provider: 'local' }
  ],
  en: [
    { content: 'Small focused steps can quietly change the shape of your whole day.', author: 'TimeFlow', provider: 'local' },
    { content: 'Discipline grows every time you return your attention to what matters.', author: 'TimeFlow', provider: 'local' },
    { content: 'You do not need a perfect day. You only need a deliberate next step.', author: 'TimeFlow', provider: 'local' }
  ]
}

function randomFallback(locale: Locale) {
  const list = fallbackQuotes[locale]
  return list[Math.floor(Math.random() * list.length)]
}

async function requestJson<T>(url: string) {
  const response = await uni.request<T>({
    url,
    method: 'GET',
    timeout: 5000
  })
  return response.data
}

export async function fetchMotivationQuote(locale: Locale): Promise<MotivationQuote> {
  try {
    if (locale === 'zh-CN') {
      const data = await requestJson<{
        hitokoto?: string
        from?: string
        from_who?: string | null
      }>('https://v1.hitokoto.cn/?encode=json&c=d&c=k&min_length=10&max_length=28')

      if (data?.hitokoto) {
        return {
          content: data.hitokoto,
          author: data.from_who || data.from || 'Hitokoto',
          provider: 'hitokoto'
        }
      }
    } else {
      const data = await requestJson<Array<{ q?: string; a?: string }>>('https://zenquotes.io/api/random')
      const quote = Array.isArray(data) ? data[0] : null

      if (quote?.q) {
        return {
          content: quote.q,
          author: quote.a || 'ZenQuotes',
          provider: 'zenquotes'
        }
      }
    }
  } catch (error) {
    return randomFallback(locale)
  }

  return randomFallback(locale)
}
