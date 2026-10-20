import { useEffect, useState } from 'react'

export type TicketDraft = { body: string; reason: string; status: 'waiting_user' | 'resolved' }
const EMPTY: TicketDraft = { body: '', reason: '', status: 'waiting_user' }
const PREFIX = 'admin-ticket-draft:'

export function readDraft(storage: Pick<Storage, 'getItem'>, key: string): TicketDraft {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null')
    if (!value || typeof value.body !== 'string' || typeof value.reason !== 'string') return EMPTY
    if (!Number.isFinite(value.savedAt) || Date.now() - value.savedAt > 86400000) return EMPTY
    return {
      body: value.body.slice(0, 2000),
      reason: value.reason.slice(0, 300),
      status: value.status === 'resolved' ? 'resolved' : 'waiting_user',
    }
  } catch {
    return EMPTY
  }
}

export function clearTicketDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key)
  } catch {
    /* Storage may be disabled. */
  }
}

export function useTicketDraft(actorId: string, ticketId: string) {
  const key = `${PREFIX}${actorId}:${ticketId}`
  const [draft, setDraft] = useState<TicketDraft>(() => {
    try {
      return readDraft(sessionStorage, key)
    } catch {
      return EMPTY
    }
  })
  const [storageFailed, setStorageFailed] = useState(false)
  useEffect(() => {
    try {
      if (draft.body || draft.reason)
        sessionStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() }))
      else sessionStorage.removeItem(key)
      setStorageFailed(false)
    } catch {
      setStorageFailed(true)
    }
  }, [draft, key])
  useEffect(() => {
    if (!draft.body && !draft.reason) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft.body, draft.reason])
  return { draft, setDraft, storageFailed }
}
