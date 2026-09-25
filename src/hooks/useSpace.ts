import { accessFailure } from '../lib/accessFailure'
import { clearOutboxForUser } from '../lib/outbox'
import { clearEventOutboxForUser } from '../lib/eventOutbox'
import { clearPhotoOutboxForUser } from '../lib/photoOutbox'
import { useEventOutbox } from './useEventOutbox'
import { usePhotoOutbox } from './usePhotoOutbox'
import { cleanupAccountLocal, cleanupSessionPrivacy } from '../lib/accountCleanup'
import { clearChatDraftsForUser } from '../lib/chatDraftStorage'
import { BibuNative } from '../native'
import { clearStoredPushToken, readStoredPushToken } from '../lib/pushRegistration'
import {
  clearPendingAccountDeletion,
  markPendingAccountDeletion,
} from '../lib/accountDeletionRecovery'
import { withRequestDeadline } from '../lib/requestDeadline'
import { useSpaceRealtime } from './useSpaceRealtime'
import type { Focus } from '../lib/types'
import { normalizeOutfits } from '../lib/pet/normalize'
import type { CharacterOutfits } from '../lib/pet/types'
import {
  cacheEnabled,
  clearSpaceCache,
  networkFailure,
  readSpaceCache,
  setCacheEnabled,
  writeSpaceCache,
} from '../lib/spaceCache'
import { useMessageOutbox } from './useMessageOutbox'
import { validReferenceId, type ReferenceKind } from '../lib/routes'
import type { LinkedRecord } from '../lib/types'
import { applySavedMemory } from '../lib/memorySave'
import { memoryInput } from '../lib/memories'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import * as api from '../lib/api'
import { db, errorText, must, supabase } from '../lib/supabase'
import { readDemo, saveDemo } from '../lib/demo'
import { isPing, mergePings, shouldPresentPing } from '../lib/pingHistory'
import type { PingKind } from '../lib/ping'
import { playFeedback } from '../lib/notifications'
import { clearImageCache, imageCacheKey, removeCachedImage } from '../lib/imageCache'
import { togetherDays, daysUntil } from '../lib/dates'
import { dailyMemories, upcomingEvents } from '../lib/home'
import { DEFAULT_KEY, DEFAULT_URL } from '../lib/supabase'
import type { AvatarType, EventInput, MemoryInput, Photo, Ping, Space } from '../lib/types'

export function useSpace(
  session: Session | null,
  demo: boolean,
  loadSpace: typeof api.loadSpace = api.loadSpace,
) {
  const [space, setSpace] = useState<Space | null>(() => (demo ? readDemo() : null))
  const [loading, setLoading] = useState(!demo)
  const [error, setError] = useState('')
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const cachedAtRef = useRef<number | null>(null)
  cachedAtRef.current = cachedAt
  const [cacheError, setCacheError] = useState('')
  const [offlineCacheEnabled, setOfflineCacheEnabled] = useState(
    () => !!session?.user.id && cacheEnabled(session.user.id),
  )
  const [inviteCode, setInviteCode] = useState('')
  const [connection, setConnection] = useState(demo ? '本地演示' : '连接中')
  const [ping, setPing] = useState<{ id: string; name: string; kind: string } | null>(null)
  const dismissPing = useCallback(() => setPing(null), [])
  const version = useRef(0)
  const stateRef = useRef(space)
  stateRef.current = space
  const userId = session?.user.id
  const accessToken = session?.access_token

  const syncWidget = useCallback(
    (targetSpace: Space | null) => {
      if (!targetSpace?.couple) return
      try {
        const now = new Date()
        const days = targetSpace.couple.together_since
          ? togetherDays(targetSpace.couple.together_since, now)
          : 0
        const events = upcomingEvents(targetSpace, now).map((e) => ({
          name: e.title,
          daysRemaining: daysUntil(e.target_at, e.yearly, now),
          targetAt: e.target_at,
          yearly: e.yearly,
        }))
        const memories = dailyMemories(targetSpace.photos, targetSpace.couple.id, now)
        const photoUrls = memories
          .map((p) => p.url)
          .filter((u): u is string => typeof u === 'string' && u.length > 0)
          .slice(0, 3)
        const partnerName = targetSpace.partner?.name || '另一半'

        void BibuNative.widget.syncData({
          days,
          togetherSince: targetSpace.couple.together_since,
          partnerName,
          events,
          photoUrls,
          supabaseUrl: DEFAULT_URL,
          anonKey: DEFAULT_KEY,
          accessToken,
        })
      } catch {
        // Widget sync errors should never crash or interrupt space loading
      }
    },
    [accessToken],
  )
  const reload = useCallback(async (): Promise<boolean> => {
    if (demo || !userId) return false
    const current = ++version.current
    try {
      const data = await withRequestDeadline(
        (signal) => loadSpace(userId, signal),
        20000,
        '空间读取超时（network timeout），请检查网络并重试',
      )
      if (current === version.current) {
        // A live INSERT may arrive after this snapshot began loading.
        const previous = stateRef.current
        const next =
          data.couple && previous?.couple?.id === data.couple.id
            ? { ...data, pings: mergePings(data.couple.id, data.pings, previous.pings) }
            : data
        stateRef.current = next
        setSpace(next)
        setError('')
        setCachedAt(null)
        try {
          writeSpaceCache(userId, data)
          setCacheError('')
        } catch (cacheFailure) {
          setCacheError(errorText(cacheFailure))
        }
        syncWidget(next)
        return current === version.current
      }
      return false
    } catch (e) {
      if (current === version.current) {
        setError(errorText(e))
        if (networkFailure(e)) {
          if (!stateRef.current) {
            const cached = readSpaceCache(userId)
            if (cached) {
              stateRef.current = cached.space
              setSpace(cached.space)
              setCachedAt(cached.savedAt)
            }
          }
        } else {
          // Authorization/schema errors are never an excuse to restore private cached content.
          try {
            clearSpaceCache(userId)
          } catch (cacheFailure) {
            setCacheError(errorText(cacheFailure))
          }
          if (cachedAtRef.current !== null || accessFailure(e)) {
            stateRef.current = null
            setSpace(null)
            setCachedAt(null)
            setPing(null)
            setInviteCode('')
          }
        }
      }
      return false
    } finally {
      if (current === version.current) setLoading(false)
    }
  }, [demo, userId, loadSpace])
  useEffect(() => {
    void reload()
    return () => {
      version.current++
    }
  }, [reload])
  useEffect(() => {
    if (space?.partner) setInviteCode('')
  }, [space?.partner?.id])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && stateRef.current) {
        syncWidget(stateRef.current)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncWidget])
  const cid = space?.couple?.id
  const outbox = useMessageOutbox(userId, cid, !demo, (saved) => {
    const current = stateRef.current
    if (current?.couple?.id !== saved.couple_id || current.me.id !== saved.sender_id) return
    const messages = [...current.messages.filter((m) => m.id !== saved.id), saved].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    version.current++
    const next = { ...current, messages }
    stateRef.current = next
    setSpace(next)
    void reload()
  })
  const eventOutbox = useEventOutbox(userId, cid, !demo, (value) => {
    const current = stateRef.current
    if (!current || current.couple?.id !== cid) return
    if (value.operation === 'delete') {
      const next = {
        ...current,
        events: current.events.filter((event) => event.id !== value.eventId),
        photos: current.photos.map((photo) =>
          photo.event_id === value.eventId ? { ...photo, event_id: null } : photo,
        ),
      }
      stateRef.current = next
      setSpace(next)
    } else {
      const events = [
        ...current.events.filter((event) => event.id !== value.event.id),
        value.event,
      ].sort((a, b) => a.target_at.localeCompare(b.target_at) || a.id.localeCompare(b.id))
      const next = { ...current, events }
      stateRef.current = next
      setSpace(next)
    }
    void reload()
  })
  const photoOutbox = usePhotoOutbox(userId, cid, !demo, (saved) => {
    const current = stateRef.current
    if (!current || current.couple?.id !== cid || saved.couple_id !== cid) return
    const next = {
      ...current,
      photos: [
        { ...saved, url: undefined },
        ...current.photos.filter((photo) => photo.id !== saved.id),
      ],
    }
    stateRef.current = next
    setSpace(next)
    void reload()
  })
  const realtimeReload = useCallback(async () => {
    await reload()
  }, [reload])
  useSpaceRealtime({
    demo,
    userId,
    coupleId: cid,
    reload: realtimeReload,
    onLocal(next) {
      stateRef.current = next
      setSpace(next)
    },
    onConnection: setConnection,
    onPing(incoming) {
      const current = stateRef.current
      if (!isPing(incoming) || incoming.couple_id !== cid || current?.couple?.id !== cid || !userId)
        return
      const present = shouldPresentPing(incoming, current.pings, userId)
      const next = { ...current, pings: mergePings(cid!, current.pings, [incoming]) }
      stateRef.current = next
      setSpace(next)
      if (present) {
        const partnerName = current.partner?.name || '另一位玩家'
        setPing({ id: incoming.id, name: partnerName, kind: incoming.kind })
        playFeedback(incoming.kind)
      }
    },
  })
  const readReference = useCallback(
    async (kind: ReferenceKind, id: string): Promise<LinkedRecord | null> => {
      if (!validReferenceId(id)) throw new Error('关联记录 ID 无效')
      const current = stateRef.current
      if (!cid || current?.couple?.id !== cid) return null
      if (demo) {
        if (kind === 'message') {
          const record = current.messages.find((m) => m.id === id && m.couple_id === cid)
          return record ? { kind, record } : null
        }
        const record = current.events.find((e) => e.id === id && e.couple_id === cid)
        return record ? { kind, record } : null
      }
      return api.readLinkedRecord(cid, kind, id)
    },
    [cid, demo],
  )
  const invitationStatus = useCallback(async (): Promise<{
    active: boolean
    expires_at: string
  } | null> => {
    const result = await db().rpc('invitation_status').maybeSingle()
    if (result.error) throw result.error
    const value = result.data as { active?: unknown; expires_at?: unknown } | null
    if (value === null) return null
    if (
      !value ||
      typeof value.active !== 'boolean' ||
      typeof value.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(value.expires_at))
    )
      throw new Error('邀请状态格式无效')
    return { active: value.active, expires_at: value.expires_at }
  }, [])
  function local(update: (old: Space) => Space) {
    const next = update(stateRef.current!)
    saveDemo(next) // Do not falsely report success when localStorage quota is exceeded.
    stateRef.current = next
    setSpace(next)
  }
  async function mutate(remote: () => Promise<unknown>, update: (old: Space) => Space) {
    if (demo) local(update)
    else {
      await remote()
      const refreshed = await reload()
      if (!refreshed)
        throw new Error('服务器操作可能已经保存，但页面刷新失败；请点击重试确认，不要重复提交')
    }
  }
  function validateLocalLinks(memory: MemoryInput) {
    if (!demo) return // The server checks links outside the currently loaded page too.
    const current = stateRef.current!
    if (
      memory.event_id &&
      !current.events.some((e) => e.id === memory.event_id && e.couple_id === cid)
    )
      throw new Error('关联事件已不存在，请重新选择')
    if (
      memory.message_id &&
      !current.messages.some((m) => m.id === memory.message_id && m.couple_id === cid)
    )
      throw new Error('关联消息已不存在，请重新选择')
  }
  const me = space?.me.id || ''
  return {
    space,
    readReference,
    invitationStatus,
    outbox,
    eventOutbox,
    photoOutbox,
    cachedAt,
    cacheError,
    offlineCacheEnabled,
    setOfflineCache(enabled: boolean) {
      if (!userId || demo) return
      setCacheEnabled(userId, enabled)
      setOfflineCacheEnabled(enabled)
      if (enabled && stateRef.current && cachedAtRef.current === null) {
        writeSpaceCache(userId, stateRef.current)
        syncWidget(stateRef.current)
      }
      setCacheError('')
    },
    clearOfflineSnapshot() {
      if (!userId || demo) return
      setCacheEnabled(userId, false)
      setOfflineCacheEnabled(false)
      setCacheError('')
    },
    loading,
    error,
    connection,
    ping,
    inviteCode,
    dismissPing,
    reload,
    async message(content: string) {
      const clean = content.trim()
      if (!clean || clean.length > 2000) throw new Error('消息需为 1–2000 字')
      if (!demo) {
        await outbox.enqueue(clean)
        return
      }
      await mutate(
        () => api.sendMessage(cid!, me, clean),
        (s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              id: crypto.randomUUID(),
              couple_id: cid!,
              sender_id: me,
              content: clean,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      )
    },
    async addEvent(input: EventInput): Promise<{ queued: boolean }> {
      if (!cid) throw new Error('请先进入空间')
      if (!demo) {
        await eventOutbox.enqueueCreate({ ...input, category: input.category || 'other' })
        return { queued: true }
      }
      await mutate(
        () => api.addEvent(cid, me, input),
        (s) => ({
          ...s,
          events: [
            ...s.events,
            { ...input, id: crypto.randomUUID(), couple_id: cid, created_by: me },
          ],
        }),
      )
      return { queued: false }
    },
    async updateEvent(id: string, input: EventInput): Promise<{ queued: boolean }> {
      if (!cid) throw new Error('请先进入空间')
      const current = stateRef.current?.events.find((event) => event.id === id)
      if (!current) throw new Error('事件不存在或已刷新，请重新打开')
      const normalized = { ...input, category: input.category || 'other' }
      if (!demo) {
        await eventOutbox.enqueueUpdate(id, normalized)
        return { queued: true }
      }
      await mutate(
        () => api.updateEventOnce(id, cid, normalized),
        (s) => ({
          ...s,
          events: s.events.map((event) => (event.id === id ? { ...event, ...normalized } : event)),
        }),
      )
      return { queued: false }
    },
    async deleteEvent(id: string): Promise<{ queued: boolean }> {
      if (!cid) throw new Error('请先进入空间')
      if (!demo) {
        if (!stateRef.current?.events.some((event) => event.id === id))
          throw new Error('事件不存在或已刷新，请重新打开')
        await eventOutbox.enqueueDelete(id)
        return { queued: true }
      }
      await mutate(
        () => api.deleteEvent(id),
        (s) => ({
          ...s,
          events: s.events.filter((e) => e.id !== id),
          photos: s.photos.map((p) => (p.event_id === id ? { ...p, event_id: null } : p)),
        }),
      )
      return { queued: false }
    },
    async upload(file: File, caption: string, memory: Partial<MemoryInput> = {}) {
      const metadata = memoryInput(memory)
      validateLocalLinks(metadata)
      if (caption.length > 120) throw new Error('照片标题最多 120 字')
      api.validatePhoto(file)
      if (demo) {
        if (file.size > 1500000)
          throw new Error('本地演示请使用小于 1.5 MB 的图片；连接 Supabase 后支持 5 MB')
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        local((s) => ({
          ...s,
          photos: [
            {
              id: crypto.randomUUID(),
              couple_id: cid!,
              uploaded_by: me,
              ...metadata,
              path: url,
              url,
              caption,
              created_at: new Date().toISOString(),
            },
            ...s.photos,
          ],
        }))
      } else {
        // Use the same fixed-ID/idempotent path online and offline. The queue
        // records the user's intent before any Storage request starts, so a
        // lost response cannot orphan a committed object or create a duplicate
        // photo on retry.
        await photoOutbox.enqueue(file, caption, metadata)
        return { queued: true }
      }
      return { queued: false }
    },
    async deletePhoto(id: string, knownPhoto?: Photo) {
      const current = stateRef.current
      const photo = current?.photos.find((p) => p.id === id) || knownPhoto
      if (!cid) throw new Error('请先进入空间')
      if (demo && (!photo || photo.uploaded_by !== me)) throw new Error('只能删除自己上传的回忆')
      if (demo) {
        local((s) => ({ ...s, photos: s.photos.filter((p) => p.id !== id) }))
        return
      }
      await api.deletePhoto(id, cid, me)
      if (photo) await removeCachedImage(imageCacheKey(photo))
      version.current++
      const latest = stateRef.current
      if (latest?.couple?.id === cid && latest.me.id === me) {
        const next = { ...latest, photos: latest.photos.filter((p) => p.id !== id) }
        stateRef.current = next
        setSpace(next)
        try {
          writeSpaceCache(me, next)
          syncWidget(next)
        } catch (e) {
          setCacheError(errorText(e))
        }
      }
      await reload()
    },
    async updateMemory(id: string, caption: string, memory: MemoryInput) {
      const metadata = memoryInput(memory)
      validateLocalLinks(metadata)
      if (caption.length > 120) throw new Error('照片标题最多 120 字')
      const photo = stateRef.current?.photos.find((p) => p.id === id)
      if (demo && (!photo || photo.uploaded_by !== me)) throw new Error('只能编辑自己上传的回忆')
      if (demo) {
        const saved = { ...photo!, caption, ...metadata }
        local((s) => applySavedMemory(s, saved))
        return saved
      } else {
        const saved = await api.updateMemory(id, caption, metadata)
        // Invalidate snapshots started before this committed write.
        version.current++
        const current = stateRef.current
        if (current?.me.id === me && current.couple?.id === cid) {
          const next = applySavedMemory(current, saved)
          stateRef.current = next
          setSpace(next)
        }
        // Refresh failure remains a separate visible sync error; never resend this edit.
        await reload()
        return saved
      }
    },
    async startFocus(activity: string, minutes: number, allow: boolean): Promise<Focus> {
      if (
        !activity.trim() ||
        activity.trim().length > 40 ||
        !Number.isInteger(minutes) ||
        minutes < 1 ||
        minutes > 180
      )
        throw new Error('请输入有效专注内容及 1–180 分钟时长')
      const value: Focus = {
        user_id: me,
        couple_id: cid!,
        activity: activity.trim(),
        ends_at: new Date(Date.now() + minutes * 60000).toISOString(),
        allow_reminders: allow,
      }
      if (demo) {
        local((s) => ({ ...s, focus: [...s.focus.filter((f) => f.user_id !== me), value] }))
        return value
      }
      const saved = (await api.setFocus(cid!, me, value.activity, minutes, allow)) as Focus
      if (
        saved.user_id !== me ||
        saved.couple_id !== cid ||
        !Number.isFinite(Date.parse(saved.ends_at))
      )
        throw new Error('服务端返回的专注记录不匹配，请刷新确认')
      version.current++
      const current = stateRef.current
      if (current?.me.id === me && current.couple?.id === cid) {
        const next = {
          ...current,
          focus: [...current.focus.filter((f) => f.user_id !== me), saved],
        }
        stateRef.current = next
        setSpace(next)
      }
      await reload()
      return saved
    },
    async endFocus() {
      if (demo) {
        local((s) => ({ ...s, focus: s.focus.filter((f) => f.user_id !== me) }))
        return
      }
      await api.endFocus(cid!)
      version.current++
      const current = stateRef.current
      if (current?.me.id === me && current.couple?.id === cid) {
        const next = { ...current, focus: current.focus.filter((f) => f.user_id !== me) }
        stateRef.current = next
        setSpace(next)
      }
      await reload()
    },
    async sendPing(kind: PingKind = '哔卟哔卟') {
      if (demo) {
        const incoming: Ping = {
          id: crypto.randomUUID(),
          couple_id: cid!,
          sender_id: me,
          kind,
          created_at: new Date().toISOString(),
        }
        local((s) => ({ ...s, pings: mergePings(cid!, s.pings, [incoming]) }))
        setPing({ id: incoming.id, name: '演示预览 · ' + space!.me.name, kind })
        playFeedback(kind)
      } else {
        await api.sendPing(kind)
        await reload()
      }
    },
    async save(name: string, since: string, avatar?: AvatarType, outfits?: CharacterOutfits) {
      await mutate(
        () => api.saveSettings(me, cid, name, since, avatar, outfits),
        (s) => ({
          ...s,
          me: {
            ...s.me,
            name,
            ...(avatar ? { avatar } : {}),
            ...(outfits !== undefined ? { outfits: normalizeOutfits(outfits) } : {}),
          },
          couple: s.couple ? { ...s.couple, together_since: since } : null,
        }),
      )
    },
    async updateGreeting(title: string, subtitle: string) {
      if (!cid) throw new Error('尚未绑定空间')
      await mutate(
        () => api.updateGreeting(cid, title, subtitle),
        (s) => ({
          ...s,
          couple: s.couple
            ? { ...s.couple, greeting_title: title, greeting_subtitle: subtitle }
            : null,
        }),
      )
    },
    async signOut(): Promise<string[]> {
      if (demo || !userId || !supabase) return []
      try {
        const cleanupErrors = await cleanupSessionPrivacy({
          // Remove only this installation's row before invalidating the local session.
          removeDeviceInstallations: async () => {
            const token = readStoredPushToken()
            if (token) await api.removeDeviceInstallation(userId, token)
          },
          unregisterPush: async () => {
            const result = await BibuNative.push.unregister()
            if (!result.supported && result.reason && !result.reason.includes('Web'))
              throw new Error(result.reason)
            clearStoredPushToken()
          },
          listReminders: () => BibuNative.reminders.list(),
          cancelReminder: (id) => BibuNative.reminders.cancel(id),
        })
        const remoteFailure = cleanupErrors.find((item) => item.startsWith('远程 Push 登记：'))
        if (remoteFailure)
          throw new Error(
            `退出登录前无法清理远程 Push 登记，请保持当前账号登录并重试：${remoteFailure}`,
          )
        setCacheEnabled(userId, false)
        setOfflineCacheEnabled(false)
        setCacheError('')
        clearSpaceCache(userId)
        await clearImageCache()
        clearChatDraftsForUser(userId)
        const signedOut = await supabase.auth.signOut()
        if (signedOut.error) throw signedOut.error
        return cleanupErrors
      } catch (error) {
        setError(`退出登录前清理失败：${errorText(error)}`)
        throw error
      }
    },
    async deleteAccount(expectedSpace: string | null): Promise<{ cleanupWarning?: string }> {
      if (demo || !userId) throw new Error('演示模式不能注销真实账号')
      markPendingAccountDeletion(userId, expectedSpace)
      await api.deleteAccount(expectedSpace)
      const cleanupErrors = await cleanupAccountLocal({
        clearSpaceCache: () => {
          setCacheEnabled(userId, false)
          clearSpaceCache(userId)
        },
        clearOutbox: async () => {
          await clearOutboxForUser(userId)
          await clearEventOutboxForUser(userId)
          await clearPhotoOutboxForUser(userId)
        },
        removeSavedEmail: () => localStorage.removeItem('bibu-saved-email'),
        clearChatDrafts: () => clearChatDraftsForUser(userId),
        unregisterPush: async () => {
          const result = await BibuNative.push.unregister()
          if (!result.supported && result.reason && !result.reason.includes('Web'))
            throw new Error(result.reason)
          clearStoredPushToken()
        },
        listReminders: () => BibuNative.reminders.list(),
        cancelReminder: (id) => BibuNative.reminders.cancel(id),
      })
      await clearImageCache()
      clearPendingAccountDeletion()
      stateRef.current = null
      setSpace(null)
      setPing(null)
      setInviteCode('')
      setCachedAt(null)
      setOfflineCacheEnabled(false)
      try {
        const signedOut = await supabase?.auth.signOut({ scope: 'local' })
        if (signedOut?.error) cleanupErrors.push(`本机会话：${errorText(signedOut.error)}`)
      } catch (error) {
        cleanupErrors.push(`本机会话：${errorText(error)}`)
      }
      return cleanupErrors.length ? { cleanupWarning: cleanupErrors.join('；') } : {}
    },
    async closeRelationship(expectedSpace: string) {
      if (demo) throw new Error('演示模式不能解除真实绑定')
      if (!cid || cid !== expectedSpace) throw new Error('空间已变化，请刷新后确认')
      const closed = must(await db().rpc('close_relationship', { expected_space: expectedSpace }))
      if (closed !== expectedSpace) throw new Error('解除结果未确认，请联网刷新，不要重复创建空间')
      // Revoke visible state immediately, even if the subsequent refresh or local cleanup fails.
      version.current++
      const current = stateRef.current
      if (current?.couple?.id === expectedSpace) {
        const next = {
          ...current,
          couple: null,
          partner: null,
          messages: [],
          events: [],
          photos: [],
          pings: [],
          focus: [],
        }
        stateRef.current = next
        setSpace(next)
        setPing(null)
        setInviteCode('')
        setCachedAt(null)
      }
      try {
        if (userId) setCacheEnabled(userId, false)
        setOfflineCacheEnabled(false)
        await clearImageCache()
      } catch (e) {
        setCacheError(errorText(e))
      }
      await reload()
    },
    async createSpace() {
      const code = must(await db().rpc('create_space')) as string
      setInviteCode(code)
      await reload()
      return code
    },
    async joinSpace(code: string) {
      must(await db().rpc('join_space', { invite_code: code }))
      await reload()
    },
    async revokeInvitation() {
      const value = must(await db().rpc('revoke_invitation'))
      if (value !== true) throw new Error('撤销未确认，请刷新检查')
      setInviteCode('')
    },
    async refreshInvite() {
      const code = must(await db().rpc('refresh_invite')) as string
      setInviteCode(code)
      return code
    },
  }
}
export type SpaceController = ReturnType<typeof useSpace>
