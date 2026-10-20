import { clearChatDraft, readChatDraft, writeChatDraft } from '../lib/chatDraftStorage'
import { clearSentDraft, type DraftSnapshot } from '../lib/chatDraft'
import { useMessageHistory } from '../hooks/useMessageHistory'
import { LinkedRecordPanel } from '../components/LinkedRecordPanel'
import { PhotoViewer } from './Photos'
import type { Photo } from '../lib/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SpaceController } from '../hooks/useSpace'
import { Button, Empty, useTask } from '../components/ui'
import { Icon, PixelPal } from '../components/PixelArt'
import { EventArt } from '../components/EventArt'
import { clock, dateLabel } from '../lib/dates'
import { BibuNative } from '../native'
import { mergeMessages } from '../lib/messageHistory'

// Red pixel-style "!"; marks a message that has not reached the server yet
// (offline / send failed).
function SendFailedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="send-failed-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      role="img"
      aria-label="消息未送达，网络恢复后将自动重试"
    >
      <path fillRule="evenodd" d="M10 3h4v13h-4zM9 17h6v4H9z" />
    </svg>
  )
}

// 像素笑脸，替代 emoji 作为快捷短语入口图标
function SmileyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="14" height="14" fill="currentColor" />
      <rect x="2" y="2" width="12" height="12" fill="#fffef8" />
      <rect x="5" y="5" width="2" height="2" fill="currentColor" />
      <rect x="9" y="5" width="2" height="2" fill="currentColor" />
      <rect x="5" y="9" width="6" height="2" fill="currentColor" />
    </svg>
  )
}

// 快捷短语：像素图形 + 纯文本，不依赖 emoji 字符
const QUICK_REACTIONS = [
  { art: 'heart', text: '喜欢你' },
  { art: 'heart', text: '抱抱' },
  { art: 'star', text: '超开心' },
  { art: 'balloon', text: '好心情' },
  { art: 'cat', text: '喵~' },
  { art: 'bunny', text: '兔兔' },
  { art: 'flower', text: '送你小花' },
  { art: 'tea', text: '吃点好的' },
  { art: 'dumbbell', text: '加油！' },
  { art: 'moon', text: '晚安，好梦' },
  { art: 'heart', text: '想你啦！' },
]

export function Chat({
  controller,
  demo,
  referenceId,
}: {
  controller: SpaceController
  demo: boolean
  referenceId?: string
}) {
  const space = controller.space!,
    [draft, setDraft] = useState<DraftSnapshot>(() => readChatDraft(space.me.id, space.couple!.id)),
    [memory, setMemory] = useState<Photo | null>(null),
    [emoji, setEmoji] = useState(false),
    { busy, run } = useTask(),
    end = useRef<HTMLDivElement>(null)
  const text = draft.text
  const draftRef = useRef(draft)
  draftRef.current = draft
  function editText(update: string | ((text: string) => string)) {
    const previous = draftRef.current
    const next = {
      text: typeof update === 'function' ? update(previous.text) : update,
      revision: previous.revision + 1,
    }
    draftRef.current = next
    setDraft(next)
  }
  const history = useMessageHistory(space.couple!.id, space.messages, demo)
  // Locally queued messages the server has not confirmed yet (e.g. sent while
  // offline). They render inline as bubbles; ones that failed to go out carry a
  // red exclamation mark.
  const pendingFailures = new Set(
    controller.outbox.rows
      .filter(
        (row) =>
          row.status === 'blocked' ||
          Boolean(row.error) ||
          !navigator.onLine ||
          (row.nextAttemptAt !== undefined && row.nextAttemptAt > Date.now()),
      )
      .map((row) => row.id),
  )
  const pendingMessages = controller.outbox.rows.map((row) => ({
    id: row.id,
    couple_id: row.coupleId,
    sender_id: row.userId,
    content: row.content,
    created_at: new Date(row.queuedAt).toISOString(),
  }))
  const messages = mergeMessages(space.couple!.id, pendingMessages, history.messages)
  const scroll = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const [unread, setUnread] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        writeChatDraft(space.me.id, space.couple!.id, draftRef.current)
      } catch {
        /* Draft persistence is optional; message sending remains authoritative. */
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [draft.revision, space.me.id, space.couple!.id])
  useLayoutEffect(() => {
    const container = scroll.current
    if (container && anchor.current && !history.busy) {
      container.scrollTop = anchor.current.top + container.scrollHeight - anchor.current.height
      anchor.current = null
    }
  }, [messages.length, history.busy])
  useEffect(() => {
    if (referenceId) return
    if (nearBottom.current) end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    else setUnread(true)
  }, [space.messages.at(-1)?.id, referenceId])
  useLayoutEffect(() => {
    const el = scroll.current
    if (el && !referenceId) {
      el.scrollTop = el.scrollHeight
    }
  }, [referenceId])

  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text])

  useEffect(() => {
    const handleResize = () => {
      const el = input.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function submit() {
    if (!text.trim() || busy) return
    // Send haptic: a single light tick. Native Android on device, navigator
    // .vibrate fallback in browsers that allow it, silent no-op elsewhere.
    void BibuNative.vibration.pulse([12]).catch(() => {})
    const sent = { ...draftRef.current }
    void run(async () => {
      await controller.message(sent.text)
      const next = clearSentDraft(draftRef.current, sent)
      draftRef.current = next
      setDraft(next)
      if (!next.text) {
        if (input.current) input.current.style.height = 'auto'
        try {
          clearChatDraft(space.me.id, space.couple!.id)
        } catch {
          /* Optional cleanup. */
        }
      }
      input.current?.focus()
    })
  }
  return (
    <>
      {referenceId && (
        <LinkedRecordPanel
          key={`${space.couple!.id}:${referenceId}`}
          controller={controller}
          kind="message"
          id={referenceId}
        />
      )}
      <section className="chat-window" aria-label="悄悄话">
        <header className="chat-page-heading">
          <h1>悄悄话</h1>
          <span>和{space.partner?.name || '另一位玩家'}的日常</span>
        </header>
        <div
          ref={scroll}
          onScroll={() => {
            const el = scroll.current
            if (el) {
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
              if (nearBottom.current) setUnread(false)
            }
          }}
          className="chat-messages"
          role="log"
          aria-label="聊天记录"
          aria-live="polite"
        >
          <div className="chat-start-label">
            <Icon name="heart" size={13} />
            {demo ? '演示消息，来试着发一句吧' : `已加载 ${messages.length} 条 · 仅你们两人可读`}
          </div>
          {history.hasMore && (
            <Button
              tone="white"
              disabled={history.busy}
              onClick={() =>
                void (async () => {
                  const el = scroll.current
                  if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop }
                  await history.loadOlder()
                  // React's next render restores the anchor when rows are prepended.
                })()
              }
            >
              {history.busy ? '正在读取历史…' : '加载更早的悄悄话'}
            </Button>
          )}
          {history.error && <p role="alert">历史读取失败，当前记录保留：{history.error}</p>}
          {!history.hasMore && !demo && messages.length > 0 && (
            <p className="chat-start-label">已加载到最早的消息</p>
          )}
          {!messages.length && (
            <Empty
              icon={<Icon name="chat" size={40} />}
              title="故事，从一句你好开始"
              description="在这里说点什么吧。"
            />
          )}
          {messages.map((message, i) => {
            const own = message.sender_id === space.me.id
            const date = dateLabel(message.created_at)
            return (
              <div key={message.id}>
                {(i === 0 || date !== dateLabel(messages[i - 1].created_at)) && (
                  <div className="chat-date">{date}</div>
                )}
                <div className={`message-row ${own ? 'own' : ''}`}>
                  <span className={`tiny-avatar ${own ? '' : 'pink'}`}>
                    <PixelPal
                      type={own ? space.me.avatar : space.partner?.avatar || 'bunny'}
                      outfit={
                        own
                          ? space.me.outfits?.[space.me.avatar]
                          : space.partner?.outfits?.[space.partner?.avatar || 'bunny']
                      }
                    />
                  </span>
                  <div className="message-content">
                    <span className="message-author">
                      {own
                        ? space.me.name
                        : message.sender_id === null
                          ? '已注销玩家'
                          : space.partner?.name}{' '}
                      <time>{clock(message.created_at)}</time>
                    </span>
                    <div className="message-bubble-wrap">
                      {pendingFailures.has(message.id) && <SendFailedIcon />}
                      <p className="message-bubble">{message.content}</p>
                    </div>
                    {space.photos
                      .filter((p) => p.message_id === message.id)
                      .map((photo) => (
                        <button
                          key={photo.id}
                          className="chat-memory-link"
                          onClick={() => setMemory(photo)}
                        >
                          关联回忆：{photo.caption || '打开这个瞬间'}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={end} />
        </div>
        {unread && (
          <Button
            tone="yellow"
            onClick={() => {
              end.current?.scrollIntoView({ block: 'nearest' })
              nearBottom.current = true
              setUnread(false)
            }}
          >
            有新消息 · 回到最新
          </Button>
        )}
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {emoji && (
            <div className="chat-emojis">
              {QUICK_REACTIONS.map((item) => (
                <button
                  type="button"
                  key={item.text}
                  onClick={() => {
                    editText((t) => (t + item.text).slice(0, 2000))
                    input.current?.focus()
                  }}
                >
                  <EventArt value={item.art} size={20} />
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-main">
            <button
              type="button"
              className="emoji-toggle"
              aria-label="选择快捷短语"
              aria-expanded={emoji}
              onClick={() => setEmoji(!emoji)}
            >
              <SmileyIcon />
            </button>
            <textarea
              ref={input}
              aria-label="聊天消息"
              placeholder="输入一条只属于你们的悄悄话…"
              rows={1}
              maxLength={2000}
              value={text}
              onChange={(e) => editText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <Button
              tone="green"
              type="submit"
              disabled={!text.trim() || busy}
              aria-label="发送消息"
            >
              <span>{busy ? '发送中' : '发送'}</span>
              <Icon name="send" size={17} />
            </Button>
          </div>
        </form>
      </section>
      {memory && (
        <PhotoViewer photo={memory} controller={controller} onClose={() => setMemory(null)} />
      )}
    </>
  )
}
