import { pingFeedback } from '../lib/ping'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, PixelPal } from './PixelArt'
import type { Profile } from '../lib/types'
import './PingEffect.css'

export function PingEffect({
  ping,
  sender,
  onClose,
  onChat,
}: {
  ping: { id: string; name: string; kind: string }
  sender?: Profile | null
  onClose: () => void
  onChat: () => void
}) {
  const feedback = pingFeedback(ping.kind)
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(document.hidden)
  const noteId = useId()
  const notice = useRef<HTMLElement>(null)
  const previousFocus = useRef<Element | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement
    const update = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      // Restore only focus that was inside this notice; never interrupt typing elsewhere.
      if (
        notice.current?.contains(document.activeElement) &&
        previousFocus.current instanceof HTMLElement
      ) {
        previousFocus.current.focus({ preventScroll: true })
      }
    }
  }, [])

  useEffect(() => {
    if (expanded || hovered || focused || hidden) return
    const timer = setTimeout(onClose, 8000)
    return () => clearTimeout(timer)
  }, [expanded, hovered, focused, hidden, onClose, ping.id])

  const gesture = ping.kind === '晚安' ? 'sleepy' : ping.kind === '抱一下' ? 'hug' : 'hello'
  const dismiss = () => {
    if (
      notice.current?.contains(document.activeElement) &&
      previousFocus.current instanceof HTMLElement
    ) {
      previousFocus.current.focus({ preventScroll: true })
    }
    onClose()
  }

  return createPortal(
    <aside
      ref={notice}
      className={`ping-visitor ${expanded ? 'is-expanded' : ''}`}
      aria-label="收到哔卟"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          dismiss()
        }
      }}
    >
      <div
        className="ping-visitor-announcement"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {ping.name}发来{ping.kind}。{feedback.message}
      </div>
      <div className="ping-visitor-arrival">
        <button
          type="button"
          className="ping-visitor-open"
          aria-expanded={expanded}
          aria-controls={noteId}
          aria-label={`${expanded ? '收起' : '打开'}${ping.name}的小纸条：${ping.kind}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className={`ping-visitor-pet gesture-${gesture}`} aria-hidden="true">
            <PixelPal
              type={sender?.avatar || 'bunny'}
              outfit={sender?.outfits?.[sender.avatar]}
              size={64}
            />
          </span>
          <span className="ping-visitor-bubble">
            <span className="ping-visitor-name">{ping.name}</span>
            <strong>{ping.kind}</strong>
            <small>{expanded ? '点我收起' : '点我看看'}</small>
          </span>
        </button>
        <button
          type="button"
          className="ping-visitor-close"
          aria-label="收起哔卟提醒"
          onClick={dismiss}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div id={noteId} className="ping-visitor-note" hidden={!expanded}>
        <p>{feedback.message}</p>
        <div className="ping-visitor-actions">
          <button type="button" onClick={dismiss}>
            收好啦 <Icon name="check" size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              onChat()
            }}
          >
            去悄悄话 <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    </aside>,
    document.body,
  )
}
