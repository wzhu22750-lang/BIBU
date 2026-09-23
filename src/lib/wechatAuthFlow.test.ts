import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeWechatTicket,
  getWechatBindingStatus,
  initiateWechatBind,
  initiateWechatLogin,
  unbindWechat,
} from './wechatAuth'
import { db } from './supabase'

describe('wechatAuth client SDK flows', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).window = {
      location: {
        origin: 'https://www.515171.xyz',
        href: '',
      },
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('initiateWechatLogin requests authorize URL and redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://open.weixin.qq.com/connect/qrconnect?appid=wx123' }),
    })
    global.fetch = fetchMock

    const res = await initiateWechatLogin()
    expect(res.url).toBe('https://open.weixin.qq.com/connect/qrconnect?appid=wx123')
    expect(fetchMock).toHaveBeenCalledWith('/api/wechat/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'login', redirect_to: 'https://www.515171.xyz' }),
    })
    expect((globalThis as any).window.location.href).toBe(
      'https://open.weixin.qq.com/connect/qrconnect?appid=wx123',
    )
  })

  it('initiateWechatBind passes Bearer token and redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://open.weixin.qq.com/connect/qrconnect?appid=wxbind' }),
    })
    global.fetch = fetchMock

    const res = await initiateWechatBind('test-access-token')
    expect(res.url).toBe('https://open.weixin.qq.com/connect/qrconnect?appid=wxbind')
    expect(fetchMock).toHaveBeenCalledWith('/api/wechat/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer test-access-token',
      },
      body: JSON.stringify({ action: 'bind', redirect_to: 'https://www.515171.xyz' }),
    })
    expect((globalThis as any).window.location.href).toBe(
      'https://open.weixin.qq.com/connect/qrconnect?appid=wxbind',
    )
  })

  it('exchangeWechatTicket exchanges ticket and sets session in supabase auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user_id: 'user_123',
        session: { access_token: 'acc_token', refresh_token: 'ref_token' },
      }),
    })
    global.fetch = fetchMock

    const setSessionSpy = vi.spyOn(db().auth, 'setSession').mockResolvedValue({
      data: { session: {} as any, user: {} as any },
      error: null,
    })

    const result = await exchangeWechatTicket('ticket_xyz')
    expect(result.userId).toBe('user_123')
    expect(setSessionSpy).toHaveBeenCalledWith({
      access_token: 'acc_token',
      refresh_token: 'ref_token',
    })
  })

  it('getWechatBindingStatus calls get_wechat_binding_status RPC', async () => {
    const rpcSpy = vi.spyOn(db(), 'rpc').mockResolvedValue({
      data: { bound: true, has_email_auth: true, can_unbind: true, openid_masked: '***1234' },
      error: null,
    } as any)

    const status = await getWechatBindingStatus()
    expect(rpcSpy).toHaveBeenCalledWith('get_wechat_binding_status')
    expect(status.bound).toBe(true)
    expect(status.canUnbind).toBe(true)
    expect(status.openidMasked).toBe('***1234')
  })

  it('unbindWechat calls unbind_wechat_identity RPC and handles errors', async () => {
    const rpcSpy = vi.spyOn(db(), 'rpc').mockResolvedValue({
      data: true,
      error: null,
    } as any)

    await unbindWechat()
    expect(rpcSpy).toHaveBeenCalledWith('unbind_wechat_identity')

    rpcSpy.mockResolvedValueOnce({
      data: null,
      error: { message: '尚未设置登录密码' },
    } as any)
    await expect(unbindWechat()).rejects.toThrow('尚未设置登录密码')
  })
})
