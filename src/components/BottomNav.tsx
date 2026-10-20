import { useEffect, useRef, useState } from 'react'
import type { Page } from '../lib/types'
import type { BibuAction } from '../hooks/useBibu'
import { Icon } from './PixelArt'
import moreIcon from 'pixelarticons/svg/more-horizontal.svg'
import { BibuSendControl } from './bibu/BibuSendControl'

export function BottomNav({
  page,
  navigate,
  bibu,
}: {
  page: Page
  navigate: (page: Page) => void
  bibu: BibuAction
}) {
  const [more, setMore] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!more) return
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setMore(false)
      }
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMore(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [more])

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const updateHeight = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) {
        document.documentElement.style.setProperty('--dock-actual-height', `${Math.round(h)}px`)
      }
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    // Include safe-area padding in the height reserved by the chat page.
    observer.observe(el, { box: 'border-box' })
    window.addEventListener('resize', updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  function go(target: Page) {
    setMore(false)
    navigate(target)
  }

  return (
    <nav ref={ref} className="bottom-nav bibo-dock" aria-label="移动端导航">
      <button
        className={`dock-item ${page === 'home' ? 'active' : ''}`}
        aria-current={page === 'home' ? 'page' : undefined}
        onClick={() => go('home')}
      >
        <span className="dock-icon dock-blue">
          <Icon name="home" size={24} />
        </span>
        <span>小窝</span>
      </button>
      <button
        className={`dock-item ${page === 'chat' ? 'active' : ''}`}
        aria-current={page === 'chat' ? 'page' : undefined}
        onClick={() => go('chat')}
      >
        <span className="dock-icon dock-green">
          <Icon name="chat" size={24} />
        </span>
        <span>悄悄话</span>
      </button>
      <BibuSendControl
        bibu={bibu}
        isMoreOpen={more}
        onOpenChange={(open) => {
          if (open) setMore(false)
        }}
      />
      <button
        className={`dock-item ${page === 'events' ? 'active' : ''}`}
        aria-current={page === 'events' ? 'page' : undefined}
        onClick={() => go('events')}
      >
        <span className="dock-icon dock-pink">
          <Icon name="calendar" size={24} />
        </span>
        <span>值得期待</span>
      </button>
      <button
        ref={trigger}
        className={`dock-item ${['photos', 'focus', 'wardrobe', 'settings'].includes(page) || more ? 'active' : ''}`}
        aria-expanded={more}
        aria-controls="dock-more"
        onClick={() => setMore(!more)}
      >
        <span className="dock-icon dock-lilac">
          <img src={moreIcon} alt="" aria-hidden="true" width={24} height={24} />
        </span>
        <span>更多</span>
      </button>
      {more && (
        <div className="dock-more" id="dock-more">
          <span className="micro">MORE LITTLE THINGS</span>
          {(
            [
              { page: 'wardrobe', name: '萌宠衣橱', icon: 'shirt' },
              { page: 'photos', name: '照片墙', icon: 'photo' },
              { page: 'focus', name: '专注陪伴', icon: 'focus' },
              { page: 'settings', name: '空间设置', icon: 'settings' },
            ] as const
          ).map((item) => (
            <button
              key={item.page}
              aria-current={page === item.page ? 'page' : undefined}
              onClick={() => go(item.page)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.name}</span>
              <Icon name="arrow" size={13} />
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
