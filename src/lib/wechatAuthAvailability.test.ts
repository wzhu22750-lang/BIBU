import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadProbe() {
  vi.resetModules()
  const mod = await import('./wechatAuth')
  return mod.checkWechatLoginAvailable
}

function jsonResponse(status: number) {
  return new Response(JSON.stringify({ error: 'wechat_unavailable' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('微信服务可用性探测', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('服务端函数未部署（404）时判定为不可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404)),
    )
    const check = await loadProbe()
    expect(await check()).toBe(false)
  })

  it('函数已部署（未登录返回 401）时判定为可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401)),
    )
    const check = await loadProbe()
    expect(await check()).toBe(true)
  })

  it('站点兜底返回 HTML 时判定为不可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    )
    const check = await loadProbe()
    expect(await check()).toBe(false)
  })

  it('网络异常时判定为不可用，且同一会话只探测一次', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const check = await loadProbe()
    expect(await check()).toBe(false)
    expect(await check()).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
