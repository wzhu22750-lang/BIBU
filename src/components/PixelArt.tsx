import type { CSSProperties } from 'react'
import type { AvatarType } from '../lib/types'
import { CHARACTER_LIST } from '../lib/pet'
import { PixelCharacter } from './pet/PixelCharacter'
import type { Outfit } from '../lib/pet/types'

export const AVATAR_LIST: { id: AvatarType; name: string; tag: string }[] = CHARACTER_LIST.map(
  (c) => ({
    id: c.id as AvatarType,
    name: c.name,
    tag: c.tag,
  }),
)

export type IconName =
  | 'home'
  | 'chat'
  | 'calendar'
  | 'photo'
  | 'focus'
  | 'settings'
  | 'heart'
  | 'arrow'
  | 'plus'
  | 'close'
  | 'sound'
  | 'lock'
  | 'logout'
  | 'send'
  | 'star'
  | 'check'
  | 'upload'
  | 'edit'
  | 'spark'
  | 'shirt'
  | 'crown'
  | 'gem'
  | 'shuffle'
  | 'undo'
  | 'grid'
  | 'trash'
  | 'wand'
  | 'wechat'
const paths: Record<IconName, string> = {
  shirt:
    'M4 3h6v2H4zM2 3h2v8H2zm2 6h4v2H4zm2 0h2v10H6zm2 10h8v2H8zm8-10h2v10h-2zm0 0h4v2h-4zm4-6h2v8h-2zm-6 0h6v2h-6zm-4 2h4v2h-4z',
  crown:
    'M3 3h2v12H3zm16 0h2v12h-2zm-8 0h2v2h-2zM9 5h2v2H9zM5 5h2v2H5zM3 3h2v2H3zm4 4h2v2H7zm6-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zM5 15h14v2H5zm-2 4h18v2H3z',
  gem: 'M7 1h10v2H7zM5 3h2v2H5zm12 0h2v2h-2zm2 2h2v2h-2zm0 8h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2-2h2v2H9zm-2-2h2v2H7zm-2-2h2v2H5zm-2-2h2v2H3zm0-8h2v2H3zM1 7h2v6H1zm20 0h2v6h-2zM3 9h18v2H3zm6-6h2v3H9zM7 6h2v3H7zm8 0h2v3h-2zm-8 5h2v2H7zm2 2h2v3H9zm2 3h2v3h-2zm2-3h2v3h-2zm2-2h2v2h-2zm-2-8h2v3h-2z',
  shuffle:
    'M10 19H2v-2h8v2Zm12 0h-8v-2h8v2Zm-10-2h-2v-6h2v6Zm6-10h2v2h2v2h-2v2h-2v2h-2v-4h-4V9h4V5h2v2ZM8 11H2V9h6v2Z',
  undo: 'M18 20h-6v-2h6v2Zm2-2h-2v-8h2v8Zm-10-4H8v-2H6v-2H4V8h2V6h2V4h2v4h8v2h-8v4Z',
  grid: 'M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM4 8h16v2H4zm0 6h16v2H4zM8 4h2v16H8zm6 0h2v16h-2z',
  trash: 'M5 20V6H3V4h6V2h6v2h6v2h-2v14H5zm2-2h10V6H7v12zm2-10h2v8H9V8zm4 0h2v8h-2V8z',
  wand: 'M14 22H12V20H14V22ZM20 22H18V20H20V22ZM5 19H9V21H3V15H5V19ZM18 20H16V18H18V20ZM22 20H20V18H22V20ZM11 19H9V16H11V19ZM20 18H18V16H20V18ZM13 16H11V13H13V16ZM8 15H5V13H8V15ZM11 13H8V11H11V13ZM15 13H13V11H15V13ZM21 13H19V11H21V13ZM4 12H2V10H4V12ZM13 11H11V9H13V11ZM17 11H15V9H17V11ZM15 9H13V7H15V9ZM19 9H17V7H19V9ZM6 8H4V6H6V8ZM17 7H15V5H17V7ZM21 7H19V5H17V3H21V7ZM4 6H2V4H4V6ZM8 6H6V4H8V6ZM13 5H11V3H13V5ZM6 4H4V2H6V4Z',
  home: 'M10 2h4v2h2v2h2v2h2v2h2v4h-4v8h-6v-6h-2v6H4v-8H2v-4h2V8h2V6h2V4h2zm0 6H8v2H6v10h2v-6h6v6h2V10h-2V8h-2V6h-2z',
  chat: 'M4 3h16v2h2v13h-2v2H9v2H5v-4H2V5h2zm0 2v11h3v3l3-3h10V5zm3 4h2v3H7zm4 0h2v3h-2zm4 0h2v3h-2z',
  calendar: 'M6 2h2v3h8V2h2v3h4v17H2V5h4zM4 7v3h16V7zm0 5v8h16v-8zm3 2h3v3H7zm7 0h3v3h-3z',
  photo: 'M2 3h20v18H2zm2 2v14h16V5zm2 2h4v4H6zm7 4h3v2h2v4H6v-2h3v-2h4z',
  focus:
    'M8 1h8v2H8zm3 3h2v2h5v2h2v2h2v8h-2v2h-2v2H6v-2H4v-2H2v-8h2V8h2V6h5zM6 10H4v8h2v2h12v-2h2v-8h-2V8H6zm5 0h2v5h4v2h-6z',
  settings:
    'M9 2h6v3h3V3h3v6h-3v6h3v6h-3v-2h-3v3H9v-3H6v2H3v-6h3V9H3V3h3v2h3zm1 7v2H8v3h2v2h4v-2h2v-3h-2V9z',
  heart: 'M4 3h5v2h2v2h2V5h2V3h5v2h2v8h-2v2h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4v-2H2V5h2z',
  arrow: 'M12 3h3v3h3v3h3v6h-3v3h-3v3h-3v-6H3V9h9zm3 6v6h3V9z',
  plus: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  close: 'M3 3h4v4h3v3h4V7h3V3h4v4h-4v3h-3v4h3v3h4v4h-4v-4h-3v-3h-4v3H7v4H3v-4h4v-3h3v-4H7V7H3z',
  sound: 'M11 3h3v18h-3v-3H8v-3H3V9h5V6h3zm6 4h2v10h-2zm4-4h2v18h-2z',
  lock: 'M8 2h8v2h2v6h3v12H3V10h3V4h2zm0 4v4h8V6h-2V4h-4v2zm3 8v5h2v-5z',
  logout: 'M2 2h11v3H5v14h8v3H2zm14 3h3v3h3v8h-3v3h-3v-5H9v-4h7z',
  send: 'M2 2h4v2h4v2h4v2h4v2h4v4h-4v2h-4v2h-4v2H6v2H2v-8h10v-4H2zm3 4v2h6V6zm0 10v2h6v-2z',
  star: 'M10 1h4v6h3v3h6v4h-6v3h-3v6h-4v-6H7v-3H1v-4h6V7h3z',
  check: 'M18 4h4v5h-3v3h-3v3h-3v3h-3v3H6v-3H3v-3H0v-5h4v3h3v3h3v-3h3v-3h3V7h2z',
  upload: 'M10 2h4v3h3v3h3v3h-5v6H9v-6H4V8h3V5h3zM2 16h3v4h14v-4h3v7H2z',
  edit: 'M3 17v4h4L19 9l-4-4zm3 2v-1l9-9 1 1-9 9zm11-12 2-2 3 3-2 2z',
  spark: 'M9 0h3v5h3v3h5v3h-5v3h-3v5H9v-5H6v-3H1V8h5V5h3zm10 16h2v3h3v2h-3v3h-2v-3h-3v-2h3z',
  // 像素风微信气泡：气泡主体 + 两个眼睛（evenodd 镂空）+ 左下小尾巴
  wechat: 'M3 3h18v2h2v10h-2v2h-7v2h-2v-2h-1v3H9v-3H5v2H3v-2H1V5h2zM8 8h2v2H8zm6 0h2v2h-2z',
}
export function Icon({
  name,
  size = 22,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`pixel-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={paths[name]} />
    </svg>
  )
}
export function PixelPal({
  type = 'cat',
  size = 80,
  className = '',
  style,
  outfit,
}: {
  type?: AvatarType | string
  size?: number
  className?: string
  style?: CSSProperties
  outfit?: Outfit | null
}) {
  return (
    <PixelCharacter
      character={type}
      outfit={outfit}
      size={size}
      className={`pixel-pal ${className}`}
      style={style}
    />
  )
}
export function PixelFlower({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path
        d="M24 0h16v8h8v8h8v8h8v16h-8v8h-8v8h-8v8H24v-8h-8v-8H8v-8H0V24h8v-8h8V8h8z"
        fill="#171917"
      />
      <path d="M24 4h16v16h20v20H40v20H24V40H4V24h20z" fill="#fffced" />
      <path d="M24 24h16v16H24z" fill="#fff238" />
      <path d="M24 24h4v4h-4zm12 0h4v4h-4zM28 32h8v4h-8z" fill="#171917" />
    </svg>
  )
}
