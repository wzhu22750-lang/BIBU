export type IconName =
  | 'overview'
  | 'users'
  | 'heart'
  | 'ticket'
  | 'pulse'
  | 'audit'
  | 'system'
  | 'shield'
  | 'search'
  | 'refresh'
  | 'logout'
  | 'back'
  | 'chevron'
  | 'alert'
  | 'check'
  | 'close'
  | 'copy'
  | 'plus'
  | 'lock'
  | 'external'
  | 'menu'
  | 'calendar'
  | 'device'

const paths: Record<IconName, string> = {
  overview: 'M3 3h7v7H3zm11 0h7v4h-7zM3 14h7v7H3zm11-3h7v10h-7z',
  users:
    'M6 3h6v2h2v6h-2v2H6v-2H4V5h2zm2 2v5h2v2h1v-2h1V5zM2 15h4v2h8v-2h4v7H2zm12-9h4v2h2v5h-2v2h-4v-2h-2V8h2z',
  heart: 'M4 3h5v2h2v2h2V5h2V3h5v2h2v8h-2v2h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4v-2H2V5h2z',
  ticket:
    'M4 3h16v2h2v13h-2v2H9v2H5v-4H2V5h2zm0 2v11h3v3l3-3h10V5zm3 4h2v3H7zm4 0h2v3h-2zm4 0h2v3h-2z',
  pulse:
    'M8 1h8v2H8zm3 3h2v2h5v2h2v2h2v8h-2v2h-2v2H6v-2H4v-2H2v-8h2V8h2V6h5zM6 10H4v8h2v2h12v-2h2v-8h-2V8H6zm5 0h2v5h4v2h-6z',
  audit: 'M3 3h18v2H3zm0 6h12v2H3zm0 6h12v2H3zm0 6h18v2H3zM18 12h2v2h2v2h2v4h-4v-2h-2v-2h-2v-4z',
  system:
    'M9 2h6v3h3V3h3v6h-3v6h3v6h-3v-2h-3v3H9v-3H6v2H3v-6h3V9H3V3h3v2h3zm1 7v2H8v3h2v2h4v-2h2v-3h-2V9z',
  shield: 'M8 2h8v2h2v6h3v12H3V10h3V4h2zm0 4v4h8V6h-2V4h-4v2zm3 8v5h2v-5z',
  search:
    'M10 2h4v2h2v2h2v4h-2v2h-2v2h-4v-2H8v-2H6V6h2V4h2zm0 2v2H8v4h2v2h4v-2h2V6h-2V4zm6 12h3v2h2v2h2v4h-4v-2h-2v-2h-3z',
  refresh:
    'M12 2h7v2h2v6h-2V6h-2V4h-5zM5 5h7v2H7v2H5zm-3 5h2v7h2v2h5v2H6v-2H4v-2H2zm12 10h5v2h-5zm5-3h2v5h-2z',
  logout: 'M2 2h11v3H5v14h8v3H2zm14 3h3v3h3v8h-3v3h-3v-5H9v-4h7z',
  back: 'M13 4h3v3h2v2h2v2h2v2h-2v2h-2v2h-2v3h-3v-6H3v-4h10z',
  chevron: 'M9 4h3v3h2v2h2v2h2v2h-2v2h-2v2h-2v3H9v-3h2v-2h2v-2h2v-2h-2V9h-2V6H9z',
  alert: 'M10 2h4v3h2v3h2v3h2v3h2v6H2v-6h2v-3h2V8h2V5h2zm2 5h-2v6h2zm0 8h-2v2h2z',
  check: 'M18 4h4v5h-3v3h-3v3h-3v3h-3v3H6v-3H3v-3H0v-5h4v3h3v3h3v-3h3v-3h3V7h2z',
  close: 'M3 3h4v4h3v3h4V7h3V3h4v4h-4v3h-3v4h3v3h4v4h-4v-4h-3v-3h-4v3H7v4H3v-4h4v-3h3v-4H7V7H3z',
  copy: 'M4 2h12v4h-2V4H6v10h2v2H4zm6 6h10v14H10zm2 2v10h6V10z',
  plus: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z',
  lock: 'M8 2h8v2h2v6h3v12H3V10h3V4h2zm0 4v4h8V6h-2V4h-4v2zm3 8v5h2v-5z',
  external:
    'M14 3h7v7h-2V6h-2v2h-2V6h-1zM3 5h9v2H5v12h12v-7h2v9H3zm8 2h2v2h2v2h-2v2h-2v2h-2v-2h2v-2h2V9h-2z',
  menu: 'M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z',
  calendar: 'M6 2h2v3h8V2h2v3h4v17H2V5h4zM4 7v3h16V7zm0 5v8h16v-8zm3 2h3v3H7zm7 0h3v3h-3z',
  device: 'M6 2h12v2h2v16h-2v2H6v-2H4V4h2zm0 2v16h12V4zm3 3h6v2H9zm0 4h6v2H9zm0 4h4v2H9z',
}

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" d={paths[name]} />
    </svg>
  )
}

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="28" height="28" fill="currentColor" />
      <rect x="4" y="4" width="24" height="24" fill="#fff238" />
      <rect x="18" y="6" width="6" height="6" fill="#ffa6e8" />
      <rect x="8" y="6" width="6" height="6" fill="#04bcf0" />
      <rect x="14" y="8" width="4" height="12" fill="#20211d" />
      <rect x="14" y="22" width="4" height="4" fill="#20211d" />
    </svg>
  )
}
