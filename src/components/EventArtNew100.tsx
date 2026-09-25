// 100 Curated Couple & Life Event Pure Vector Pixel Art SVGs for EventArtPicker
export const newEventArt100Ids = [
  // 1-20: 美食甜点
  'hotpot',
  'bbq',
  'sushi',
  'ramen',
  'milktea',
  'pizza',
  'burger',
  'donut',
  'popcorn',
  'baking',
  'cocktail',
  'pancake',
  'cherry',
  'strawberry',
  'watermelon',
  'dumpling',
  'taco',
  'bento',
  'fondue',
  'macaron',
  // 21-40: 约会旅行与户外
  'ferriswheel',
  'carousel',
  'fireworks',
  'airballoon',
  'aquarium',
  'museum',
  'planetarium',
  'picnic',
  'sunset',
  'hotspring',
  'skiing',
  'surfing',
  'stargazing',
  'cablecar',
  'lighthouse',
  'island',
  'temple',
  'waterfall',
  'safari',
  'fountain',
  // 41-60: 节日纪念与浪漫仪式
  'ring',
  'letter',
  'bouquet',
  'candle',
  'toast',
  'cal_love',
  'key',
  'heart_lock',
  'origami',
  'snowglobe',
  'polaroid',
  'ribbon',
  'melodybox',
  'chime',
  'lantern',
  'luckybag',
  'wishstar',
  'firefly',
  'rainbow',
  'clover',
  // 61-80: 文艺娱乐与兴趣爱好
  'guitar',
  'piano',
  'easel',
  'palette',
  'pottery',
  'vinyl',
  'cassette',
  'arcade',
  'bowling',
  'badminton',
  'skateboard',
  'dice',
  'theater',
  'gardening',
  'knitting',
  'telescope',
  'microphone',
  'swimming',
  'yoga',
  'reading',
  // 81-100: 生活治愈与温馨日常
  'alarm',
  'slippers',
  'sofa',
  'plant',
  'mug',
  'umbrella',
  'bathtub',
  'pillow',
  'laundry',
  'mirror',
  'window',
  'teapot',
  'honey',
  'cookie',
  'jam',
  'sunflower',
  'tulip',
  'match',
  'luggage',
  'ticket',
] as const

export type NewEventArt100Id = (typeof newEventArt100Ids)[number]

export function EventArtNew100({
  id,
  size = 52,
  className = '',
}: {
  id: string
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`event-art new-event-art-100 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {id === 'hotpot' && (
        <>
          <path fill="#bc804b" d="M5 9h14v10H5zM7 19h10v2H7z" />
          <path fill="#8d5b36" d="M15 11h4v8h-4zM13 19h4v2h-4z" />
          <path fill="#ff5252" d="M6 10h6v8H6z" />
          <path fill="#be123c" d="M6 15h6v3H6z" />
          <path fill="#fff238" d="M12 10h6v8h-6z" />
          <path fill="#facc15" d="M12 15h6v3h-6z" />
          <path fill="#26c985" d="M8 12h2v2H8z" />
          <path fill="#dceef4" d="M11 10h2v8h-2z" />
          <path fill="#fffef7" d="M7 11h2v1H7zm7 1h2v1h-2zM8 3h2v3H8zm6 1h2v3h-2zm-3-2h2v3h-2z" />
          <path
            fill="#20211d"
            d="M4 8h16v2H4zm-3 3h3v4H1zm19 0h3v4h-3zM4 10h2v8H4zm14 0h2v8h-2zM5 18h14v2H5zm2 2h10v2H7zm4-10h2v8h-2zm-9-5h2v2H2zm21 0h2v2h-2zM7 2h4v2H7zm6 2h4v2h-4z"
          />
        </>
      )}
      {id === 'bbq' && (
        <>
          <path fill="#bc804b" d="M3 19h2v2H3zm2-2h2v2H5zm12-12h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2z" />
          <path fill="#8d5b36" d="M2 20h2v2H2zm18-18h2v2h-2z" />
          <path fill="#ff5252" d="M5 13h5v5H5zm8-8h5v5h-5z" />
          <path fill="#be123c" d="M7 15h3v3H7zm8-8h3v3h-3z" />
          <path fill="#2aeea4" d="M9 9h5v5H9z" />
          <path fill="#0d9977" d="M11 11h3v3h-3z" />
          <path fill="#fffef7" d="M6 14h2v1H6zm4-4h2v1h-2zm4-4h2v1h-2z" />
          <path
            fill="#20211d"
            d="M4 12h6v2H4zm-1 2h2v4H3zm2 4h6v2H5zm6-6h2v4h-2zm2-2h6v2h-6zm-1 2h2v4h-2zm6-6h2v4h-2zm-6-2h6v2h-6zm-1 2h2v4h-2zm6 4h2v2h-2zM1 21h2v2H1zm20-20h2v2h-2zm-14 9h2v2H7zm8-8h2v2h-2zm-4 4h2v2h-2z"
          />
        </>
      )}
      {id === 'sushi' && (
        <>
          <path fill="#fffef7" d="M4 12h16v6H4z" />
          <path fill="#e5f9ff" d="M4 16h16v2H4z" />
          <path fill="#ff5252" d="M4 7h16v5H4z" />
          <path fill="#be123c" d="M16 8h4v4h-4z" />
          <path fill="#ffa6e8" d="M6 8h2v4H6zm5 0h2v4h-2z" />
          <path fill="#2aeea4" d="M2 14h2v3H2z" />
          <path fill="#15803d" d="M10 6h4v13h-4z" />
          <path
            fill="#20211d"
            d="M9 6h1v13H9zm4 0h1v13h-1zM3 6h18v2H3zm-1 5h2v7H2zm18 0h2v7h-2zM3 18h18v2H3zm1-7h16v2H4zM1 13h3v5H1z"
          />
        </>
      )}
      {id === 'ramen' && (
        <>
          <path fill="#ff5252" d="M3 10h18v7H3zm3 7h12v2H6zm2 2h8v2H8z" />
          <path fill="#be123c" d="M15 11h6v6h-6zm-2 6h5v2h-5z" />
          <path fill="#fff238" d="M4 9h16v3H4z" />
          <path fill="#bc804b" d="M5 10h14v2H5zM1 4h22v2H1z" />
          <path fill="#fffef7" d="M6 9h4v3H6zm8 0h4v3h-4z" />
          <path fill="#ff9e45" d="M7 10h2v2H7z" />
          <path fill="#ffa6e8" d="M15 10h2v2h-2z" />
          <path fill="#26c985" d="M11 10h2v2h-2z" />
          <path
            fill="#20211d"
            d="M2 8h20v2H2zm-1 2h2v7H1zm19 0h2v7h-2zM4 17h16v2H4zm3 2h10v2H7zm-6-8h22v2H1zm0-6h22v2H1z"
          />
        </>
      )}
      {id === 'milktea' && (
        <>
          <path fill="#e8a64e" d="M6 7h12v13H6z" />
          <path fill="#bc804b" d="M14 9h4v11h-4z" />
          <path fill="#fffef7" d="M6 7h12v3H6zM13 1h2v8h-2z" />
          <path fill="#ffa6e8" d="M14 1h2v8h-2z" />
          <path fill="#20211d" d="M8 15h2v2H8zm4 0h2v2h-2zm3 2h2v2h-2zm-5 1h2v2h-2zm-3-1h2v2H7z" />
          <path fill="#fffef7" d="M8 15h1v1H8zm4 0h1v1h-1zm3 2h1v1h-1zm-5 1h1v1h-1zm-3-1h1v1H7z" />
          <path
            fill="#20211d"
            d="M5 5h14v2H5zm-1 2h2v13H4zm14 0h2v13h-2zM5 20h14v2H5zm7-17h4v2h-4zM6 9h12v2H6z"
          />
        </>
      )}
      {id === 'pizza' && (
        <>
          <path fill="#bc804b" d="M4 4h16v4H4z" />
          <path fill="#8d5b36" d="M14 4h6v4h-6z" />
          <path fill="#fff238" d="M5 8h14v2h-2v2h-2v2h-2v2h-2v2h-2v2H7v-4H5V8z" />
          <path fill="#facc15" d="M7 8h10v2h-2v2h-2v2h-2v2H9v-2H7z" />
          <path fill="#ff5252" d="M8 9h3v3H8zm4 3h3v3h-3zm-3 3h2v2H9z" />
          <path fill="#be123c" d="M10 10h1v2h-1zm4 3h1v2h-1z" />
          <path fill="#26c985" d="M7 9h2v1H7zm5 1h2v1h-2z" />
          <path fill="#fffef7" d="M5 5h4v1H5zm4 5h1v1H9zm4 3h1v1h-1z" />
          <path
            fill="#20211d"
            d="M3 3h18v2H3zm-1 2h2v3H2zm18 0h2v3h-2zM4 7h16v2H4zm-1 1h2v2H3zm16 0h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2H9zm-2-2h2v2H7zm-2-2h2v2H5zm-1-2h2v2H4z"
          />
        </>
      )}
      {id === 'burger' && (
        <>
          <path fill="#e8a64e" d="M5 4h14v5H5zm0 15h14v3H5z" />
          <path fill="#bc804b" d="M14 5h5v4h-5zm0 15h5v3h-5z" />
          <path fill="#fffef7" d="M8 5h2v1H8zm5 1h2v1h-2zm-3 1h2v1h-2z" />
          <path fill="#26c985" d="M4 9h16v2H4z" />
          <path fill="#2aeea4" d="M5 9h3v2H5zm6 0h3v2h-3zm5 0h3v2h-3z" />
          <path fill="#ff5252" d="M4 11h16v2H4z" />
          <path fill="#be123c" d="M14 11h6v2h-6z" />
          <path fill="#fff238" d="M4 13h16v2H4zm3 2h2v2H7zm6 0h2v2h-2z" />
          <path fill="#8d5b36" d="M4 15h16v3H4z" />
          <path fill="#5c3a21" d="M14 15h6v3h-6z" />
          <path
            fill="#20211d"
            d="M4 3h16v2H4zm-2 6h20v2H2zm0 4h20v2H2zm0 4h20v2H2zm2 5h16v2H4zM2 9v7h2V9zm18 0v7h2V9zM4 4h2v5H4zm14 0h2v5h-2z"
          />
        </>
      )}
      {id === 'donut' && (
        <>
          <path fill="#e8a64e" d="M6 4h12v16H6z" />
          <path fill="#bc804b" d="M13 5h5v14h-5z" />
          <path fill="#ffa6e8" d="M6 4h12v10H6zm-1 3h14v5H5z" />
          <path fill="#ff79c9" d="M13 5h5v9h-5z" />
          <path fill="#fffef7" d="M7 6h3v2H7zm-1 3h2v1H6zm11 1h2v1h-2z" />
          <path fill="#04bcf0" d="M10 5h2v1h-2zm5 3h2v1h-2zm-6 4h2v1H9z" />
          <path fill="#fff238" d="M14 6h2v1h-2zm-4 4h2v1h-2zm4 2h2v1h-2z" />
          <path fill="#fffef7" d="M10 10h4v4h-4z" />
          <path
            fill="#20211d"
            d="M8 2h8v2H8zm8 2h2v2h-2zm2 2h2v10h-2zm-2 10h2v2h-2zm-8 2h8v2H8zm-2-2h2v2H6zm-2-2h2v-2H4zm0-8h2v8H4zm2-2h2V4H6zm3 5h6v2H9zm-1 2h2v2H8zm6 0h2v2h-2zm-5 2h4v2H9z"
          />
        </>
      )}
      {id === 'popcorn' && (
        <>
          <path fill="#fffef7" d="M6 10h12v11H6z" />
          <path fill="#ff5252" d="M8 10h2v11H8zm4 0h2v11h-2zm4 0h2v11h-2z" />
          <path fill="#be123c" d="M16 12h2v9h-2z" />
          <path fill="#fff238" d="M5 4h14v7H5z" />
          <path fill="#facc15" d="M7 5h4v3H7zm6 1h4v3h-4zm-4 3h4v2H9z" />
          <path fill="#fffef7" d="M5 5h3v2H5zm11 0h3v2h-3zm-5-3h3v2h-3z" />
          <path
            fill="#20211d"
            d="M4 9h16v2H4zm1 12h14v2H5zm-1-1h2v2H4zm14 0h2v2h-2zm-2-12h1v11h-1zm-4 0h1v11h-1zm-4 0h1v11H8zm-2-8h14v2H6zm-2 3h2v4H4zm14 0h2v4h-2zm-8-4h4v2h-4z"
          />
        </>
      )}
      {id === 'baking' && (
        <>
          <path fill="#bc804b" d="M3 18h18v3H3z" />
          <path fill="#8d5b36" d="M14 18h7v3h-7z" />
          <path fill="#e8a64e" d="M5 7h14v11H5z" />
          <path fill="#bc804b" d="M13 8h6v10h-6z" />
          <path fill="#fff8e1" d="M7 9h2v6H7zm4-1h2v6h-2zm4 1h2v6h-2z" />
          <path
            fill="#fffef7"
            d="M6 5h12v3H6zm2 5h1v4H8zm4 0h1v4h-1zm4 0h1v4h-1zM9 1h2v3H9zm4 0h2v3h-2z"
          />
          <path
            fill="#20211d"
            d="M5 4h14v2H5zm-2 2h2v12H3zm16 0h2v12h-2zM2 17h20v2H2zm1 3h18v2H3zm3-12h2v8H6zm4-1h2v8h-2zm4 1h2v8h-2z"
          />
        </>
      )}
      {id === 'cocktail' && (
        <>
          <path fill="#04bcf0" d="M5 4h14v4h-2v2h-2v2h-2v7h3v2H8v-2h3v-7H9v-2H7V8H5z" />
          <path fill="#ffa6e8" d="M7 6h10v3H7z" />
          <path fill="#fffef7" d="M6 4h2v6H6zm5 8h2v6h-2z" />
          <path fill="#26c985" d="M16 2h5v4h-5z" />
          <path fill="#ff5252" d="M13 5h3v3h-3z" />
          <path
            fill="#20211d"
            d="M4 3h16v2H4zm-1 1h2v3H3zm16 0h2v3h-2zm-3 3h2v2h-2zm-2 2h2v2h-2zm-2 2h2v7h-2zm3 7h4v2h-4zm-7 0h3v2H7zm-2-9h2v2H5zm2 2h2v2H7zm2 2h2v2H9zm7-9h5v2h-5z"
          />
        </>
      )}
      {id === 'pancake' && (
        <>
          <path fill="#e8a64e" d="M4 6h16v14H4z" />
          <path fill="#bc804b" d="M14 7h6v13h-6zm-10 4h16v2H4zm0 4h16v2H4zm0 4h16v2H4z" />
          <path fill="#fff8e1" d="M5 7h14v3H5zm0 4h14v3H5zm0 4h14v3H5z" />
          <path fill="#fff238" d="M10 3h4v4h-4z" />
          <path fill="#bc804b" d="M12 7h3v8h-3z" />
          <path fill="#fffef7" d="M11 4h1v1h-1zm-6 4h3v1H5zm0 4h3v1H5zm0 4h3v1H5z" />
          <path
            fill="#20211d"
            d="M3 5h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm1 3h16v2H4zM2 6h2v14H2zm18 0h2v14h-2zM9 2h6v2H9z"
          />
        </>
      )}
      {id === 'cherry' && (
        <>
          <path fill="#ff5252" d="M4 12h7v7H4zm9 1h7v7h-7z" />
          <path fill="#be123c" d="M8 15h3v4H8zm9 2h3v4h-3z" />
          <path fill="#fffef7" d="M5 13h3v2H5zm9 14h3v2h-3zM5 14h2v1H5zm9 1h2v1h-2z" />
          <path fill="#26c985" d="M10 4h7v3h-7zm-4 8h2v-4h2v-2h2V3h2v2h-1v3h-2v3h-1v3H6z" />
          <path fill="#2aeea4" d="M12 4h4v2h-4z" />
          <path
            fill="#20211d"
            d="M4 11h7v2H4zm-1 2h2v6H3zm1 6h7v2H4zm6-7h2v6h-2zm4 1h7v2h-7zm-1 2h2v6h-2zm1 6h7v2h-7zm6-7h2v6h-2zM9 3h8v2H9z"
          />
        </>
      )}
      {id === 'strawberry' && (
        <>
          <path fill="#ff5252" d="M5 6h14v9h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5z" />
          <path fill="#be123c" d="M13 8h6v7h-2v2h-2v2h-2z" />
          <path fill="#ffb4b4" d="M6 7h4v4H6z" />
          <path fill="#26c985" d="M6 3h12v4H6zm5-2h2v3h-2z" />
          <path fill="#2aeea4" d="M8 4h3v2H8zm5 0h3v2h-3z" />
          <path fill="#fff238" d="M8 8h2v2H8zm6 0h2v2h-2zm-3 4h2v2h-2zm-3 4h2v1H8zm6-1h2v1h-2z" />
          <path fill="#fffef7" d="M7 7h2v1H7z" />
          <path
            fill="#20211d"
            d="M5 5h14v2H5zm-2 2h2v7H3zm16 0h2v7h-2zm-2 7h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2-2h2v2H9zm-2-2h2v2H7zm-2-2h2v2H5zm5-17h4v2h-4zM6 2h12v2H6z"
          />
        </>
      )}
      {id === 'watermelon' && (
        <>
          <path fill="#26c985" d="M3 16h18v4H3z" />
          <path fill="#0d9977" d="M3 18h18v2H3z" />
          <path fill="#e7ffef" d="M4 14h16v2H4z" />
          <path fill="#ff5252" d="M5 5h14v9H5zm3-2h8v2H8zm2-1h4v1h-4z" />
          <path fill="#be123c" d="M13 6h6v8h-6z" />
          <path fill="#ffb4b4" d="M6 6h3v4H6z" />
          <path fill="#20211d" d="M7 8h2v2H7zm7 1h2v2h-2zm-4 3h2v2h-2zm5 1h2v2h-2z" />
          <path fill="#fffef7" d="M7 6h2v1H7z" />
          <path
            fill="#20211d"
            d="M9 1h6v2H9zm-2 2h2v2H7zm8 0h2v2h-2zm-3 2h2v2h-2zm5 0h2v2h-2zm-9 2h2v7H4zm14 0h2v7h-2zM2 15h20v2H2zm1 4h18v2H3z"
          />
        </>
      )}
      {id === 'dumpling' && (
        <>
          <path fill="#bc804b" d="M2 13h20v7H2z" />
          <path fill="#8d5b36" d="M14 14h8v6h-8zm-12 2h20v2H2z" />
          <path fill="#fff8e1" d="M4 7h16v6H4z" />
          <path
            fill="#fffef7"
            d="M6 5h12v4H6zm-1 3h4v3H5zm5 0h4v3h-4zm5 0h4v3h-4zM8 1h2v3H8zm6 1h2v3h-2z"
          />
          <path
            fill="#20211d"
            d="M5 4h14v2H5zm-2 3h2v6H3zm16 0h2v6h-2zM1 12h22v2H1zm1 7h20v2H2zm-2-6h2v7H0zm22 0h2v7h-2zM7 0h4v2H7zm6 1h4v2h-4z"
          />
        </>
      )}
      {id === 'taco' && (
        <>
          <path fill="#facc15" d="M3 9h18v10H3z" />
          <path fill="#e8a64e" d="M13 10h8v9h-8z" />
          <path fill="#8d5b36" d="M6 10h12v4H6z" />
          <path fill="#26c985" d="M5 8h14v3H5z" />
          <path fill="#2aeea4" d="M7 8h3v2H7zm6 0h3v2h-3z" />
          <path fill="#ff5252" d="M6 9h3v3H6zm8 0h3v3h-3z" />
          <path fill="#fff238" d="M4 13h16v2H4z" />
          <path fill="#fffef7" d="M4 10h2v1H4zm5 3h2v1H9z" />
          <path
            fill="#20211d"
            d="M4 6h16v2H4zm-2 2h2v11H2zm18 0h2v11h-2zM3 18h18v2H3zm2-8h14v2H5z"
          />
        </>
      )}
      {id === 'bento' && (
        <>
          <path fill="#be123c" d="M3 4h18v16H3z" />
          <path fill="#fffef7" d="M5 6h6v5H5z" />
          <path fill="#ff5252" d="M7 8h2v2H7z" />
          <path fill="#fff238" d="M13 6h6v5h-6z" />
          <path fill="#facc15" d="M14 7h4v3h-4z" />
          <path fill="#26c985" d="M5 13h6v5H5z" />
          <path fill="#2aeea4" d="M6 14h4v3H6z" />
          <path fill="#e8a64e" d="M13 13h6v5h-6z" />
          <path fill="#ff5252" d="M14 14h4v3h-4z" />
          <path
            fill="#20211d"
            d="M2 3h20v2H2zm0 16h20v2H2zM2 4h2v16H2zm18 0h2v16h-2zm-9 2h2v12h-2zM4 11h16v2H4z"
          />
        </>
      )}
      {id === 'fondue' && (
        <>
          <path fill="#ff5252" d="M5 7h14v9H5z" />
          <path fill="#be123c" d="M13 8h6v8h-6zm5 2h3v3h-3z" />
          <path fill="#fff238" d="M6 8h12v4H6z" />
          <path fill="#facc15" d="M8 9h4v2H8z" />
          <path fill="#bc804b" d="M8 17h8v2H8zm2 2h4v2h-4z" />
          <path fill="#ff9e45" d="M10 18h4v2h-4z" />
          <path fill="#fffef7" d="M13 2h2v7h-2zm-7 7h3v1H6z" />
          <path fill="#e8a64e" d="M12 4h4v3h-4z" />
          <path
            fill="#20211d"
            d="M4 6h16v2H4zm-1 8h18v2H3zm4 4h10v2H7zm2 2h6v2H9zm9-10h3v4h-3zM12 1h4v2h-4z"
          />
        </>
      )}
      {id === 'macaron' && (
        <>
          <path fill="#ffa6e8" d="M5 4h14v6H5z" />
          <path fill="#ff79c9" d="M12 5h7v5h-7zm-8 4h16v2H4z" />
          <path fill="#fffef7" d="M5 8h14v2H5zm1-3h3v1H6z" />
          <path fill="#2aeea4" d="M5 12h14v6H5z" />
          <path fill="#26c985" d="M12 13h7v5h-7zm-8 4h16v2H4z" />
          <path fill="#fffef7" d="M5 15h14v2H5zm1-2h3v1H6z" />
          <path
            fill="#20211d"
            d="M6 3h12v2H6zm-2 2h2v4H4zm14 0h2v4h-2zm-14 8h2v4H4zm14 0h2v4h-2zM3 9h18v2H3zm0 8h18v2H3zm3 2h12v2H6z"
          />
        </>
      )}
      {id === 'ferriswheel' && (
        <>
          <path fill="#04bcf0" d="M7 2h10v2H7zm-4 4h2v10H3zm16 0h2v10h-2zM7 18h10v2H7z" />
          <path fill="#0284c7" d="M11 3h6v2h-6zm6 5h2v8h-2z" />
          <path fill="#ffa6e8" d="M10 1h4v3h-4zm-8 7h3v4H2zm18 0h3v4h-3zm-10 8h4v3h-4z" />
          <path
            fill="#fff238"
            d="M11 9h2v2h-2zm-6-4h3v3H5zm11 0h3v3h-3zm-11 8h3v3H5zm11 0h3v3h-3z"
          />
          <path fill="#fffef7" d="M11 10h1v1h-1zm-5-3h1v1H6zm11 0h1v1h-1z" />
          <path fill="#bc804b" d="M9 13h6v2H9zm-2 4h10v2H7zm-2 2h14v2H5z" />
          <path fill="#8d5b36" d="M13 14h2v2h-2zm2 4h2v2h-2z" />
          <path
            fill="#20211d"
            d="M7 1h10v2H7zM1 7h4v4H1zm18 0h4v4h-4zM7 19h10v2H7zm3-11h4v4h-4zm-4 7h12v2H6zm-2 4h16v2H4zM6 3h2v2H6zm10 0h2v2h-2zm-13 4h2v2H3zm16 0h2v2h-2z"
          />
        </>
      )}
      {id === 'carousel' && (
        <>
          <path fill="#ff5252" d="M3 4h18v4H3z" />
          <path fill="#be123c" d="M13 4h8v4h-8z" />
          <path fill="#fffef7" d="M5 4h3v4H5zm6 0h3v4h-3zM11 1h2v3h-2z" />
          <path fill="#fff238" d="M11 1h3v2h-3zm0 7h2v10h-2z" />
          <path fill="#bc804b" d="M5 8h2v10H5zm12 0h2v10h-2z" />
          <path fill="#ffa6e8" d="M4 11h5v4H4zm11 1h5v4h-5z" />
          <path fill="#ff79c9" d="M7 13h2v2H7zm11 1h3v2h-3z" />
          <path fill="#04bcf0" d="M2 18h20v4H2z" />
          <path fill="#0284c7" d="M13 18h9v4h-9z" />
          <path fill="#fffef7" d="M5 12h1v1H5zm12 2h1v1h-1zM3 19h4v1H3zm10 0h4v1h-4z" />
          <path
            fill="#20211d"
            d="M2 3h20v2H2zm0 17h20v2H2zM1 21h22v2H1zm10-19h3v2h-3zm-7 7h2v8H4zm12 0h2v8h-2zM3 7h18v2H3zm7 1h4v2h-4zm-7 7h6v2H3zm11 1h7v2h-7z"
          />
        </>
      )}
      {id === 'fireworks' && (
        <>
          <path
            fill="#fffef7"
            d="M11 10h2v4h-2zm-1 1h4v2h-4zM11 1h2v3h-2zm0 17h2v3h-2zM2 10h3v2H2zm17 0h3v2h-3z"
          />
          <path fill="#fff238" d="M9 9h6v6H9z" />
          <path fill="#facc15" d="M11 9h2v6h-2zm-2 2h6v2H9z" />
          <path fill="#ffa6e8" d="M11 4h2v3h-2zm0 11h2v3h-2zm-7-4h3v2H4zm13 0h3v2h-3z" />
          <path fill="#04bcf0" d="M6 6h3v3H6zm9 0h3v3h-3zm-9 9h3v3H6zm9 0h3v3h-3z" />
          <path fill="#2aeea4" d="M4 4h2v2H4zm14 0h2v2h-2zm-14 14h2v2H4zm14 0h2v2h-2z" />
          <path
            fill="#20211d"
            d="M10 9h4v6h-4zm1-8h2v3h-2zm-9 9h3v2H2zm17 0h3v2h-3zm-8 8h2v3h-2zM5 5h2v2H5zm12 0h2v2h-2zm-12 12h2v2H5zm12 0h2v2h-2z"
          />
        </>
      )}
      {id === 'airballoon' && (
        <>
          <path fill="#ff5252" d="M5 3h14v11H5z" />
          <path fill="#be123c" d="M14 4h5v9h-5z" />
          <path fill="#fffef7" d="M8 3h8v11H8zm-1 2h2v1H7z" />
          <path fill="#fff238" d="M10 3h4v11h-4z" />
          <path fill="#04bcf0" d="M5 7h14v3H5z" />
          <path fill="#ff9e45" d="M9 13h6v2H9z" />
          <path fill="#bc804b" d="M8 17h8v4H8z" />
          <path fill="#8d5b36" d="M13 18h3v3h-3z" />
          <path
            fill="#20211d"
            d="M6 2h12v2H6zm-3 4h3v7H3zm15 0h3v7h-3zm-9 8h8v2H9zm-2 2h2v2H7zm8 0h2v2h-2zm-7 4h10v2H8zm-1-4h1v4H7zm9 0h1v4h-1z"
          />
        </>
      )}
      {id === 'aquarium' && (
        <>
          <path fill="#04bcf0" d="M3 4h18v16H3z" />
          <path fill="#0284c7" d="M3 13h18v7H3z" />
          <path fill="#bae6fd" d="M4 5h16v4H4z" />
          <path fill="#fffef7" d="M5 6h4v1H5zm6 0h2v1h-2zM8 8h2v2H8zm6 1h2v2h-2z" />
          <path fill="#ff9e45" d="M9 10h6v3H9zm4 1h2v1h-2z" />
          <path fill="#fffef7" d="M11 10h2v3h-2z" />
          <path fill="#20211d" d="M9 11h1v1H9z" />
          <path fill="#26c985" d="M5 14h2v5H5zm2 2h2v3H7zm11-3h2v6h-2z" />
          <path fill="#e8a64e" d="M4 18h16v2H4z" />
          <path fill="#20211d" d="M2 3h20v2H2zm0 16h20v2H2zM2 4h2v16H2zm18 0h2v16h-2z" />
        </>
      )}
      {id === 'museum' && (
        <>
          <path fill="#bae6fd" d="M3 3h18v4H3zm1 14h16v4H4z" />
          <path
            fill="#fffef7"
            d="M5 7h14v2H5zm1 2h2v8H6zm4 0h2v8h-2zm4 0h2v8h-2zm4 0h2v8h-2zM10 4h4v2h-4z"
          />
          <path fill="#fff238" d="M8 9h2v8H8zm4 0h2v8h-2zm4 0h2v8h-2z" />
          <path
            fill="#20211d"
            d="M2 2h20v2H2zm1 4h18v2H3zm-2 14h22v2H1zm1-2h20v2H2zM5 8h3v10H5zm4 0h3v10H9zm4 0h3v10h-3zm4 0h3v10h-3z"
          />
        </>
      )}
      {id === 'planetarium' && (
        <>
          <path fill="#facc15" d="M7 6h10v10H7z" />
          <path fill="#e8a64e" d="M12 7h5v9h-5zm-5 4h10v3H7z" />
          <path fill="#04bcf0" d="M2 11h20v2H2z" />
          <path fill="#bae6fd" d="M3 10h18v1H3zm0 3h18v1H3z" />
          <path
            fill="#fffef7"
            d="M4 8h2v2H4zm14 5h2v2h-2zM5 3h2v2H5zm14 1h2v2h-2zm-3 14h2v2h-2zM8 7h2v2H8z"
          />
          <path fill="#20211d" d="M8 5h8v2H8zm-2 2h2v8H6zm10 0h2v8h-2zM8 15h8v2H8zM1 11h22v2H1z" />
        </>
      )}
      {id === 'picnic' && (
        <>
          <path fill="#bc804b" d="M4 9h16v11H4zm5-7h6v4H9z" />
          <path fill="#8d5b36" d="M14 10h6v10h-6zm-4-6h4v3h-4z" />
          <path fill="#ff5252" d="M5 9h14v5H5z" />
          <path fill="#fffef7" d="M5 9h4v2H5zm7 0h4v2h-4zm-4 2h4v2H8zm7 0h4v2h-4zM6 3h2v1H6z" />
          <path fill="#26c985" d="M14 6h3v4h-3z" />
          <path
            fill="#20211d"
            d="M3 8h18v2H3zm1 11h16v2H4zm-1-10h2v11H3zm16 0h2v11h-2zm-9-8h6v2h-6zM8 4h2v5H8zm6 0h2v5h-2z"
          />
        </>
      )}
      {id === 'sunset' && (
        <>
          <path fill="#c1a0ff" d="M2 2h20v3H2z" />
          <path fill="#ff5252" d="M2 5h20v4H2z" />
          <path fill="#ff9e45" d="M2 9h20v3H2z" />
          <path fill="#fff238" d="M8 5h8v6H8z" />
          <path fill="#fffef7" d="M9 6h6v5H9z" />
          <path fill="#04bcf0" d="M2 12h20v9H2z" />
          <path fill="#0284c7" d="M2 17h20v4H2z" />
          <path fill="#fff238" d="M8 13h8v1H8zm-2 2h12v1H6zm2 2h8v1H8zm2 2h4v1h-4z" />
          <path fill="#20211d" d="M1 1h22v2H1zm0 10h22v2H1zm0 9h22v2H1zM7 4h10v2H7z" />
        </>
      )}
      {id === 'hotspring' && (
        <>
          <path fill="#8d5b36" d="M3 11h18v9H3z" />
          <path fill="#bc804b" d="M4 12h16v7H4z" />
          <path fill="#04bcf0" d="M5 13h14v5H5z" />
          <path fill="#e5f9ff" d="M6 14h12v3H6zm9-4h4v3h-4z" />
          <path fill="#fffef7" d="M15 10h4v2h-4zM6 3h2v4H6zm5 1h2v4h-2zm5-1h2v4h-2z" />
          <path
            fill="#20211d"
            d="M2 10h20v2H2zm1 8h18v2H3zm-2-7h2v8H1zm20 0h2v8h-2zm-15-9h2v3H6zm5 1h2v3h-2zm5-1h2v3h-2zM14 9h5v2h-5z"
          />
        </>
      )}
      {id === 'skiing' && (
        <>
          <path fill="#04bcf0" d="M5 3h3v17H5zm11 0h3v17h-3z" />
          <path fill="#0284c7" d="M6 5h2v15H6zm11 0h2v15h-2z" />
          <path fill="#ff5252" d="M5 10h3v4H5zm11 0h3v4h-3z" />
          <path fill="#fffef7" d="M5 3h3v3H5zm11 0h3v3h-3z" />
          <path fill="#bc804b" d="M2 7h2v14H2zm18 0h2v14h-2z" />
          <path
            fill="#20211d"
            d="M4 1h4v3H4zm11 0h4v3h-4zm-11 18h5v2H4zm11 0h5v2h-4zM7 2h2v17H7zm11 0h2v17h-2zM1 6h3v2H1zm18 0h3v2h-3z"
          />
        </>
      )}
      {id === 'surfing' && (
        <>
          <path fill="#ffa6e8" d="M10 2h4v19h-4z" />
          <path fill="#ff79c9" d="M12 3h2v18h-2z" />
          <path fill="#fff238" d="M10 6h4v4h-4z" />
          <path fill="#04bcf0" d="M10 13h4v4h-4zM2 16h8v5H2z" />
          <path fill="#0284c7" d="M2 18h8v3H2z" />
          <path fill="#fffef7" d="M2 15h7v2H2zm8-12h1v3h-1z" />
          <path
            fill="#20211d"
            d="M10 1h4v2h-4zm-2 2h2v17H8zm6 0h2v17h-2zm-4 18h4v2h-4zM1 17h8v2H1z"
          />
        </>
      )}
      {id === 'stargazing' && (
        <>
          <path fill="#04bcf0" d="M5 8h12v12H5z" />
          <path fill="#0284c7" d="M12 9h5v11h-5z" />
          <path fill="#fff238" d="M9 10h4v4H9zm-3 5h2v2H6zm10 2h2v2h-2z" />
          <path fill="#fffef7" d="M7 6h2v12H7zm4 5h1v1h-1zM11 2h2v2h-2zm7 3h2v2h-2zM3 13h2v2H3z" />
          <path fill="#bc804b" d="M9 2h6v3H9z" />
          <path
            fill="#20211d"
            d="M8 1h8v2H8zm-4 4h14v2H4zm1 14h12v2H5zm-2-14h2v14H3zm14 0h2v14h-2z"
          />
        </>
      )}
      {id === 'cablecar' && (
        <>
          <path fill="#20211d" d="M1 2h22v2H1zm10 2h2v5h-2z" />
          <path fill="#ff5252" d="M5 8h14v11H5z" />
          <path fill="#be123c" d="M13 9h6v10h-6z" />
          <path fill="#04bcf0" d="M7 10h4v5H7zm6 0h4v5h-4z" />
          <path fill="#fffef7" d="M7 10h2v2H7zm6 0h2v2h-2zM5 7h4v1H5z" />
          <path fill="#fff238" d="M5 16h14v2H5z" />
          <path
            fill="#20211d"
            d="M4 7h16v2H4zm1 11h14v2H5zm-2-10h2v11H3zm16 0h2v11h-2zm-8-7h2v5h-2z"
          />
        </>
      )}
      {id === 'lighthouse' && (
        <>
          <path fill="#ff5252" d="M8 6h8v14H8z" />
          <path fill="#be123c" d="M13 7h3v13h-3z" />
          <path fill="#fffef7" d="M8 9h8v4H8zm-3-6h3v3H5z" />
          <path fill="#fff238" d="M10 3h4v3h-4zm5 0h7v3h-7z" />
          <path fill="#fff8e1" d="M15 4h6v2h-6z" />
          <path fill="#8d5b36" d="M5 20h14v2H5z" />
          <path
            fill="#20211d"
            d="M7 5h10v2H7zm-1 14h12v2H6zm1-13h1v14H7zm9 0h1v14h-1zM9 2h6v2H9zM5 19h14v2H5z"
          />
        </>
      )}
      {id === 'island' && (
        <>
          <path fill="#fff3d8" d="M4 14h16v4H4z" />
          <path fill="#e8a64e" d="M12 15h8v3h-8z" />
          <path fill="#bc804b" d="M11 6h2v9h-2z" />
          <path fill="#26c985" d="M8 4h8v3H8zm-4 2h5v3H4zm11 0h5v3h-5z" />
          <path fill="#2aeea4" d="M9 4h3v2H9zm-3 3h2v2H6zm10 0h2v2h-2z" />
          <path fill="#04bcf0" d="M2 17h20v4H2z" />
          <path fill="#0284c7" d="M2 19h20v2H2z" />
          <path fill="#fffef7" d="M4 18h4v1H4zm10 0h5v1h-5zM5 14h3v1H5z" />
          <path fill="#20211d" d="M3 13h18v2H3zm-2 5h22v2H1zm10-11h2v8h-2zM7 3h10v2H7z" />
        </>
      )}
      {id === 'temple' && (
        <>
          <path fill="#20211d" d="M2 3h20v2H2zm2 3h16v2H4z" />
          <path fill="#ff5252" d="M3 4h18v2H3zm2 2h14v2H5zm1 2h3v12H6zm9 0h3v12h-3z" />
          <path fill="#be123c" d="M8 9h1v11H8zm9 0h1v11h-1z" />
          <path fill="#fff238" d="M11 9h2v4h-2z" />
          <path fill="#fffef7" d="M11 10h1v2h-1z" />
          <path fill="#bae6fd" d="M3 19h18v2H3z" />
          <path
            fill="#20211d"
            d="M5 8h1v13H5zm4 0h1v13H9zm5 0h1v13h-1zm4 0h1v13h-1zm-9 3h6v2H9zM2 20h20v2H2z"
          />
        </>
      )}
      {id === 'waterfall' && (
        <>
          <path fill="#8d5b36" d="M2 3h6v17H2zm14 0h6v17h-6z" />
          <path fill="#5c3a21" d="M5 4h3v16H5zm16 0h3v16h-3z" />
          <path fill="#26c985" d="M2 2h6v3H2zm14 0h6v3h-6z" />
          <path fill="#04bcf0" d="M8 5h8v15H8z" />
          <path
            fill="#fffef7"
            d="M9 5h2v15H9zm4 2h2v13h-2zm-8-3h2v2H5zm14 0h2v2h-2zM5 18h14v3H5z"
          />
          <path fill="#0284c7" d="M8 18h8v3H8z" />
          <path fill="#20211d" d="M1 1h8v2H1zm14 0h8v2h-8zM7 4h2v16H7zm8 0h2v16h-2zM4 20h16v2H4z" />
        </>
      )}
      {id === 'safari' && (
        <>
          <path fill="#e8a64e" d="M4 8h14v7H4z" />
          <path fill="#bc804b" d="M12 9h6v6h-6z" />
          <path fill="#e5f9ff" d="M6 9h4v3H6zm6 0h4v3h-4z" />
          <path fill="#fff238" d="M2 11h2v2H2z" />
          <path fill="#20211d" d="M4 14h4v5H4zm10 0h4v5h-4z" />
          <path fill="#fffef7" d="M5 15h2v2H5zm10 0h2v2h-2zM5 7h4v1H5zm6 0h4v1h-4z" />
          <path
            fill="#20211d"
            d="M4 6h15v2H4zm-1 7h18v2H3zm1 5h4v1H4zm10 0h4v1h-4zM2 7h2v7H2zm17 0h2v7h-2z"
          />
        </>
      )}
      {id === 'fountain' && (
        <>
          <path fill="#04bcf0" d="M11 2h2v7h-2zm-3 2h2v4H8zm6 0h2v4h-2z" />
          <path fill="#bae6fd" d="M6 8h12v4H6zm-3 5h18v7H3z" />
          <path fill="#0284c7" d="M12 9h6v3h-6zm4 6h5v5h-5z" />
          <path fill="#fffef7" d="M7 9h8v2H7zm-3 5h14v3H4zm6-12h2v2h-2z" />
          <path
            fill="#20211d"
            d="M5 7h14v2H5zm-3 5h20v2H2zm1 6h18v2H3zm8-12h2v3h-2zM7 18h10v2H7z"
          />
        </>
      )}
      {id === 'ring' && (
        <>
          <path fill="#ff5252" d="M4 10h16v10H4z" />
          <path fill="#be123c" d="M14 11h6v9h-6zm-10 4h16v5H4z" />
          <path fill="#ffa6e8" d="M6 11h12v5H6z" />
          <path fill="#fff238" d="M9 4h6v5H9z" />
          <path fill="#facc15" d="M12 5h3v4h-3z" />
          <path fill="#04bcf0" d="M10 2h4v4h-4z" />
          <path fill="#fffef7" d="M11 2h2v2h-2zm-6 8h14v1H5zM8 7h2v2H8zm6 0h2v2h-2z" />
          <path
            fill="#20211d"
            d="M3 8h18v2H3zm0 10h18v2H3zM3 9h2v10H3zm16 0h2v10h-2zM9 3h6v2H9zm1-2h4v2h-4z"
          />
        </>
      )}
      {id === 'letter' && (
        <>
          <path fill="#fffef7" d="M3 5h18v14H3z" />
          <path fill="#bae6fd" d="M4 6h16v2H4zm2 2h12v2H6zm2 2h8v2H8zm-4 4h6v1H4zm0 2h10v1H4z" />
          <path fill="#ff5252" d="M10 10h4v4h-4z" />
          <path fill="#be123c" d="M12 12h2v2h-2z" />
          <path fill="#ffa6e8" d="M11 11h2v2h-2z" />
          <path fill="#fffef7" d="M11 11h1v1h-1zM4 6h3v1H4z" />
          <path
            fill="#20211d"
            d="M2 4h20v2H2zm0 14h20v2H2zM2 5h2v14H2zm18 0h2v14h-2zm-9 5h4v3h-4z"
          />
        </>
      )}
      {id === 'bouquet' && (
        <>
          <path fill="#ff5252" d="M7 3h10v8H7z" />
          <path fill="#be123c" d="M12 4h5v7h-5z" />
          <path fill="#ffa6e8" d="M9 4h3v3H9zm4 1h3v3h-3z" />
          <path fill="#fff238" d="M8 8h3v3H8zm5 0h3v3h-3z" />
          <path fill="#26c985" d="M4 7h4v4H4zm12 0h4v4h-4z" />
          <path fill="#2aeea4" d="M5 8h2v2H5zm12 0h2v2h-2z" />
          <path fill="#bc804b" d="M7 11h10v5H7zm2 5h6v5H9z" />
          <path fill="#8d5b36" d="M12 12h5v4h-5zm2 5h3v4h-3z" />
          <path fill="#ffa6e8" d="M9 14h6v3H9z" />
          <path fill="#fffef7" d="M8 4h2v1H8zm5 2h2v1h-2zM9 14h2v1H9z" />
          <path
            fill="#20211d"
            d="M6 2h12v2H6zm-3 5h4v3H3zm14 0h4v3h-4zm-8 8h8v2H9zm1 4h4v2h-4zM6 10h12v2H6z"
          />
        </>
      )}
      {id === 'candle' && (
        <>
          <path fill="#fffef7" d="M8 8h8v11H8z" />
          <path fill="#ffa6e8" d="M9 10h6v7H9zm-2 2h2v4H7z" />
          <path fill="#ff79c9" d="M12 11h3v6h-3z" />
          <path fill="#fff238" d="M11 2h2v5h-2z" />
          <path fill="#ff9e45" d="M11 4h2v3h-2z" />
          <path fill="#fffef7" d="M11 2h1v2h-1zM9 9h2v4H9z" />
          <path fill="#facc15" d="M5 18h14v3H5z" />
          <path fill="#bc804b" d="M13 18h6v3h-6zm-11 1h4v2H2z" />
          <path
            fill="#20211d"
            d="M7 7h10v2H7zm-3 12h16v2H4zm7-13h2v2h-2zm-4 3h2v9H7zm8 0h2v9h-2zM1 18h4v2H1z"
          />
        </>
      )}
      {id === 'toast' && (
        <>
          <path fill="#ff5252" d="M3 5h7v6H3zm11 0h7v6h-7z" />
          <path fill="#be123c" d="M7 6h3v5H7zm11 0h3v5h-3z" />
          <path
            fill="#fffef7"
            d="M5 11h3v6H5zm11 0h3v6h-3zm-5-8h2v3h-2zM3 17h7v2H3zm11 0h7v2h-7z"
          />
          <path fill="#fff238" d="M10 1h4v4h-4zm-2 4h3v2H8zm5 0h3v2h-3z" />
          <path fill="#ffa6e8" d="M10 2h4v2h-4z" />
          <path
            fill="#20211d"
            d="M2 4h9v2H2zm11 0h9v2h-9zm-8 7h3v6H5zm11 0h3v6h-3zM2 18h9v2H2zm11 0h9v2h-9z"
          />
        </>
      )}
      {id === 'cal_love' && (
        <>
          <path fill="#fffef7" d="M4 4h16v16H4z" />
          <path fill="#ff5252" d="M4 4h16v5H4zm5 6h6v6H9z" />
          <path fill="#be123c" d="M12 11h3v5h-3zm2-7h6v5h-6z" />
          <path fill="#ffa6e8" d="M10 11h4v4h-4z" />
          <path fill="#fffef7" d="M10 11h2v2h-2z" />
          <path fill="#bae6fd" d="M6 17h4v1H6zm8 0h4v1h-4z" />
          <path
            fill="#20211d"
            d="M6 1h2v4H6zm10 0h2v4h-2zM3 3h18v2H3zm0 17h18v2H3zM3 4h2v17H3zm16 0h2v17h-2zm-11 5h8v2H8zm0 6h8v2H8z"
          />
        </>
      )}
      {id === 'key' && (
        <>
          <path fill="#fff238" d="M4 4h8v8H4zm6 6h10v4H10zm6 3h2v3h-2zm3 0h2v3h-2z" />
          <path fill="#facc15" d="M9 5h3v7H9zm5 6h6v3h-6zm4 2h2v3h-2z" />
          <path fill="#ff9e45" d="M6 6h4v4H6z" />
          <path fill="#fffef7" d="M7 7h2v2H7zm4 4h4v1h-4zm5 3h1v1h-1z" />
          <path
            fill="#20211d"
            d="M4 3h8v2H4zm-2 3h2v6H2zm8 0h2v4h-2zm-6 6h6v2H4zm6-3h11v2H10zm5 3h2v4h-2zm3 0h2v4h-2z"
          />
        </>
      )}
      {id === 'heart_lock' && (
        <>
          <path fill="#ffa6e8" d="M4 8h16v12H4z" />
          <path fill="#ff79c9" d="M6 10h12v8H6zm6 0h6v8h-6z" />
          <path fill="#d64f94" d="M14 11h4v7h-4z" />
          <path fill="#fff238" d="M7 3h10v6H7z" />
          <path fill="#facc15" d="M12 4h5v5h-5z" />
          <path fill="#fffef7" d="M9 5h6v4H9zm-4 4h3v2H5zm6 4h2v2h-2z" />
          <path
            fill="#20211d"
            d="M11 12h2v4h-2zm-5-9h12v2H6zm-1 3h2v4H5zm12 0h2v4h-2zM3 8h18v2H3zm0 11h18v2H3zM3 9h2v11H3zm16 0h2v11h-2z"
          />
        </>
      )}
      {id === 'origami' && (
        <>
          <path fill="#04bcf0" d="M5 7h14v9H5z" />
          <path fill="#0284c7" d="M12 8h7v8h-7z" />
          <path fill="#bae6fd" d="M3 9h9v5H3zm8 0h9v5h-9z" />
          <path fill="#ffa6e8" d="M9 5h5v5H9z" />
          <path fill="#ff79c9" d="M11 6h3v4h-3z" />
          <path fill="#fffef7" d="M7 8h5v2H7zm-5 4h5v2H2zm10-5h2v2h-2z" />
          <path fill="#20211d" d="M4 6h16v2H4zm-3 4h5v2H1zm17 0h5v2h-5zM4 15h16v2H4zm5-11h5v2H9z" />
        </>
      )}
      {id === 'snowglobe' && (
        <>
          <path fill="#04bcf0" d="M4 3h16v13H4z" />
          <path fill="#bae6fd" d="M5 4h14v11H5z" />
          <path fill="#0284c7" d="M13 5h6v10h-6z" />
          <path fill="#26c985" d="M9 8h6v7H9z" />
          <path fill="#0d9977" d="M12 9h3v6h-3z" />
          <path
            fill="#fffef7"
            d="M7 6h2v2H7zm6 1h2v2h-2zm-5 4h2v2H8zm6 1h2v2h-2zM6 4h2v2H6zm3 4h6v2H9zm2-2h2v2h-2zM4 14h16v2H4z"
          />
          <path fill="#bc804b" d="M3 16h18v5H3z" />
          <path fill="#8d5b36" d="M13 17h8v4h-8z" />
          <path
            fill="#20211d"
            d="M5 2h14v2H5zm-3 3h2v11H2zm18 0h2v11h-2zM2 15h20v2H2zm1 5h18v2H3z"
          />
        </>
      )}
      {id === 'polaroid' && (
        <>
          <path fill="#fffef7" d="M4 3h16v17H4z" />
          <path fill="#04bcf0" d="M6 5h12v9H6z" />
          <path fill="#0284c7" d="M12 6h6v8h-6z" />
          <path fill="#ff5252" d="M9 8h5v4H9z" />
          <path fill="#fff238" d="M13 6h3v3h-3z" />
          <path fill="#ffa6e8" d="M10 15h4v2h-4z" />
          <path fill="#fffef7" d="M7 6h2v2H7zm4 9h2v1h-2z" />
          <path
            fill="#20211d"
            d="M3 2h18v2H3zm0 18h18v2H3zM3 3h2v18H3zm16 0h2v18h-2zM5 4h14v2H5zm0 10h14v2H5z"
          />
        </>
      )}
      {id === 'ribbon' && (
        <>
          <path fill="#ff5252" d="M3 6h7v7H3zm11 0h7v7h-7zm-4 2h4v5h-4z" />
          <path fill="#be123c" d="M7 7h3v6H7zm11 0h3v6h-3zm-6 2h2v4h-2z" />
          <path fill="#ffa6e8" d="M5 8h3v3H5zm11 0h3v3h-3z" />
          <path fill="#ff5252" d="M6 13h4v7H6zm8 0h4v7h-4z" />
          <path fill="#be123c" d="M8 14h2v6H8zm8 0h2v6h-2z" />
          <path fill="#fffef7" d="M5 8h1v1H5zm11 0h1v1h-1zm-6 1h2v1h-2z" />
          <path
            fill="#20211d"
            d="M2 5h8v2H2zm12 0h8v2h-8zM2 13h8v2H2zm12 0h8v2h-8zm-4-5h4v4h-4zm-3 8h3v5H5zm9 0h3v5h-3z"
          />
        </>
      )}
      {id === 'melodybox' && (
        <>
          <path fill="#bc804b" d="M4 9h16v11H4zm3-5h9v4H7z" />
          <path fill="#8d5b36" d="M13 10h7v10h-7zm-4-5h5v3h-5z" />
          <path fill="#fff238" d="M9 11h5v5H9zm8-6h3v3h-3z" />
          <path fill="#facc15" d="M11 12h3v4h-3zm8-5h2v2h-2z" />
          <path fill="#ffa6e8" d="M14 2h3v3h-3zm-8 1h3v3H6z" />
          <path fill="#fffef7" d="M5 10h4v1H5zm6-7h1v1h-1zM7 5h2v1H7z" />
          <path
            fill="#20211d"
            d="M3 8h18v2H3zm0 11h18v2H3zm3-15h11v2H6zm-3 7h2v10H3zm16 0h2v10h-2z"
          />
        </>
      )}
      {id === 'chime' && (
        <>
          <path fill="#04bcf0" d="M7 4h10v7H7z" />
          <path fill="#0284c7" d="M12 5h5v6h-5z" />
          <path fill="#fffef7" d="M8 5h4v3H8zm2 6h3v4h-3zM8 5h2v1H8z" />
          <path fill="#ffa6e8" d="M9 8h2v2H9zm4 0h2v2h-2z" />
          <path fill="#ff5252" d="M9 14h5v7H9z" />
          <path fill="#be123c" d="M12 15h2v6h-2z" />
          <path fill="#fff238" d="M10 16h3v3h-3z" />
          <path fill="#20211d" d="M10 1h3v4h-3zm-4 3h11v2H6zm0 6h11v2H6zm3 3h5v8H9z" />
        </>
      )}
      {id === 'lantern' && (
        <>
          <path fill="#ff5252" d="M5 5h14v13H5z" />
          <path fill="#be123c" d="M13 6h6v11h-6z" />
          <path fill="#fff238" d="M9 6h5v11H9zm2 14h2v3h-2z" />
          <path fill="#facc15" d="M7 3h9v3H7zm1 14h7v2H8z" />
          <path fill="#fff8e1" d="M10 7h3v9h-3zm1-5h1v2h-1z" />
          <path fill="#fffef7" d="M6 6h2v3H6zm4 1h1v7h-1z" />
          <path
            fill="#20211d"
            d="M6 2h11v2H6zm-2 3h15v2H4zm0 12h15v2H4zm3 3h9v2H7zm3 2h3v4h-3zM4 6h2v11H4zm13 0h2v11h-2z"
          />
        </>
      )}
      {id === 'luckybag' && (
        <>
          <path fill="#ff5252" d="M4 7h16v13H4z" />
          <path fill="#be123c" d="M13 8h7v12h-7z" />
          <path fill="#fff238" d="M6 5h11v3H6zm3 6h5v5H9z" />
          <path fill="#facc15" d="M12 6h5v2h-5zm0 6h2v4h-2z" />
          <path fill="#fffef7" d="M10 12h3v3h-3zm-5-4h2v1H5z" />
          <path
            fill="#20211d"
            d="M5 4h13v2H5zm-2 4h17v2H3zm1 11h15v2H4zm-2-9h2v11H2zm17 0h2v11h-2z"
          />
        </>
      )}
      {id === 'wishstar' && (
        <>
          <path fill="#bc804b" d="M8 2h7v3H8z" />
          <path fill="#8d5b36" d="M12 2h3v3h-3z" />
          <path fill="#04bcf0" d="M5 5h13v15H5z" />
          <path fill="#bae6fd" d="M6 6h12v13H6z" />
          <path fill="#0284c7" d="M12 7h6v12h-6z" />
          <path fill="#fff238" d="M9 9h5v5H9zm1-2h3v2h-3zm-2 3h2v2H8zm5 0h2v2h-2zm-1 3h2v2h-2z" />
          <path fill="#fffef7" d="M6 6h2v12H6zm4 4h2v2h-2z" />
          <path
            fill="#20211d"
            d="M7 1h9v2H7zm-3 4h15v2H4zm1 14h13v2H5zm-2-14h2v14H3zm15 0h2v14h-2z"
          />
        </>
      )}
      {id === 'firefly' && (
        <>
          <path fill="#bc804b" d="M7 2h9v3H7z" />
          <path fill="#8d5b36" d="M12 2h4v3h-4z" />
          <path fill="#26c985" d="M4 6h15v14H4z" />
          <path fill="#0d9977" d="M12 7h7v13h-7z" />
          <path fill="#fff238" d="M7 9h4v4H7zm6 4h4v4h-4zm-4 3h3v3H9z" />
          <path fill="#fffef7" d="M8 10h2v2H8zm6 4h2v2h-2zm-3 4h1v1h-1zM5 7h2v11H5z" />
          <path
            fill="#20211d"
            d="M6 1h11v2H6zm-3 4h17v2H3zm1 15h15v2H4zm-2-14h2v14H2zm17 0h2v14h-2z"
          />
        </>
      )}
      {id === 'rainbow' && (
        <>
          <path fill="#ff5252" d="M3 5h17v3H3z" />
          <path fill="#fff238" d="M4 8h15v3H4z" />
          <path fill="#26c985" d="M5 11h13v2H5z" />
          <path fill="#04bcf0" d="M6 13h11v2H6z" />
          <path fill="#c1a0ff" d="M7 15h9v2H7z" />
          <path fill="#fffef7" d="M1 13h7v6H1zm14 0h7v6h-7zm-11 3h3v1H4zm14 0h3v1h-3z" />
          <path fill="#e5f9ff" d="M2 17h5v2H2zm14 0h5v2h-14z" />
          <path
            fill="#20211d"
            d="M3 4h17v2H3zm-3 9h8v2H0zm14 0h8v2h-8zm-14 6h8v2H0zm14 0h8v2h-8z"
          />
        </>
      )}
      {id === 'clover' && (
        <>
          <path fill="#26c985" d="M5 4h6v6H5zm7 0h6v6h-6zm-7 7h6v6H5zm7 0h6v6h-6z" />
          <path fill="#0d9977" d="M8 6h3v4H8zm7 0h3v4h-3zm-7 7h3v4H8zm7 0h3v4h-3z" />
          <path fill="#2aeea4" d="M6 5h3v3H6zm7 0h3v3h-3zm-7 7h3v3H6zm7 0h3v3h-3z" />
          <path fill="#fffef7" d="M6 5h1v1H6zm7 0h1v1h-1zm-7 7h1v1H6zm7 0h1v1h-1z" />
          <path fill="#26c985" d="M10 10h3v10h-3z" />
          <path fill="#20211d" d="M4 3h8v2H4zm7 0h8v2h-8zm-8 8h8v2H3zm7 0h8v2h-7zm-1-6h3v10h-3z" />
        </>
      )}
      {id === 'guitar' && (
        <>
          <path fill="#e8a64e" d="M3 11h9v9H3zm4-4h7v7H7z" />
          <path fill="#bc804b" d="M8 12h4v8H8zm3-4h3v5h-3zm2-4h4v5h-4zm3-3h3v4h-3z" />
          <path fill="#8d5b36" d="M15 2h3v3h-3zm-2 4h3v3h-3z" />
          <path fill="#fffef7" d="M4 12h2v3H4zm4-4h2v2H8zm8-7h2v1h-2z" />
          <path fill="#20211d" d="M6 13h3v3H6zm4-4h2v2h-2zM15 3h3v2h-3z" />
          <path
            fill="#20211d"
            d="M2 10h10v2H2zm1 8h9v2H3zm8-13h6v2h-6zm3-3h4v2h-4zM2 11h2v8H2zm18-7h2v3h-2z"
          />
        </>
      )}
      {id === 'piano' && (
        <>
          <path fill="#fffef7" d="M2 4h20v16H2z" />
          <path fill="#ff5252" d="M3 5h18v2H3z" />
          <path
            fill="#20211d"
            d="M4 6h2v8H4zm4 0h2v8H8zm6 0h2v8h-2zm4 0h2v8h-2zM1 3h22v2H1zm0 16h22v2H1zM1 4h2v16H1zm20 0h2v16h-2zm-14 8h1v7H7zm4 0h1v7h-1zm4 0h1v7h-1zm4 0h1v7h-1z"
          />
          <path fill="#bae6fd" d="M3 17h18v2H3z" />
          <path fill="#fffef7" d="M3 7h1v8H3zm4 0h1v8H7zm6 0h1v8h-1zm4 0h1v8h-1z" />
        </>
      )}
      {id === 'easel' && (
        <>
          <path fill="#fffef7" d="M4 4h15v11H4z" />
          <path fill="#04bcf0" d="M6 6h11v7H6z" />
          <path fill="#0284c7" d="M12 7h5v6h-5z" />
          <path fill="#ff5252" d="M9 8h5v4H9z" />
          <path fill="#fff238" d="M13 6h3v3h-3z" />
          <path fill="#fffef7" d="M7 7h2v2H7z" />
          <path fill="#bc804b" d="M2 14h19v2H2zm4 2h2v6H6zm8 0h2v6h-2zm-4-13h2v4h-2z" />
          <path fill="#8d5b36" d="M14 14h7v2h-7zm2 2h2v6h-2z" />
          <path
            fill="#20211d"
            d="M3 3h17v2H3zm-2 10h21v2H1zm4 3h2v6H5zm10 0h2v6h-2zM10 1h3v4h-3z"
          />
        </>
      )}
      {id === 'palette' && (
        <>
          <path fill="#e8a64e" d="M3 4h18v16H3z" />
          <path fill="#bc804b" d="M12 5h9v14h-9z" />
          <path fill="#ff5252" d="M5 6h3v3H5z" />
          <path fill="#fff238" d="M10 6h3v3h-3z" />
          <path fill="#04bcf0" d="M15 9h3v3h-3z" />
          <path fill="#26c985" d="M7 12h3v3H7z" />
          <path fill="#ffa6e8" d="M12 13h3v3h-3z" />
          <path fill="#fffef7" d="M5 6h1v1H5zm5 0h1v1h-1zm5 3h1v1h-1zM4 4h3v1H4z" />
          <path
            fill="#20211d"
            d="M4 3h16v2H4zm-2 2h2v14H2zm18 0h2v14h-2zM4 19h16v2H4zm11-6h3v4h-3z"
          />
        </>
      )}
      {id === 'pottery' && (
        <>
          <path fill="#bc804b" d="M5 7h14v11H5z" />
          <path fill="#8d5b36" d="M12 8h7v10h-7zm-10 11h20v2H2z" />
          <path fill="#e8a64e" d="M7 4h10v4H7zm-1 6h12v4H6z" />
          <path fill="#fffef7" d="M7 5h2v2H7zm-1 6h2v3H6zM4 9h2v3H4zm14 0h2v3h-2z" />
          <path
            fill="#20211d"
            d="M6 3h12v2H6zm-2 3h2v12H4zm14 0h2v12h-2zM5 18h14v2H5zm-4 2h22v2H1zm1-10h3v4H2zm17 0h3v4h-3z"
          />
        </>
      )}
      {id === 'vinyl' && (
        <>
          <path fill="#20211d" d="M3 3h18v18H3z" />
          <path fill="#4b5563" d="M5 5h14v14H5z" />
          <path fill="#20211d" d="M6 6h12v12H6z" />
          <path fill="#ff5252" d="M8 8h8v8H8z" />
          <path fill="#be123c" d="M12 9h4v6h-4z" />
          <path fill="#fff238" d="M10 10h4v4h-4z" />
          <path
            fill="#fffef7"
            d="M11 11h2v2h-2zm-5-5h2v2H6zm10 0h-2v2h2zm0 10h-2v-2h2zm-10 0h2v-2H6z"
          />
          <path fill="#20211d" d="M5 2h14v2H5zm-3 3h2v14H2zm18 0h2v14h-2zM5 20h14v2H5z" />
        </>
      )}
      {id === 'cassette' && (
        <>
          <path fill="#04bcf0" d="M2 4h20v16H2z" />
          <path fill="#0284c7" d="M12 5h10v14h-10zm-6 11h12v2H6z" />
          <path fill="#fffef7" d="M5 7h14v7H5zm-2-2h4v1H3z" />
          <path fill="#ff5252" d="M5 7h14v2H5z" />
          <path fill="#20211d" d="M7 9h3v3H7zm7 0h3v3h-3zm-4 2h4v1h-4z" />
          <path fill="#fffef7" d="M8 10h1v1H8zm7 0h1v1h-1z" />
          <path fill="#20211d" d="M1 3h22v2H1zm0 16h22v2H1zM1 4h2v16H1zm20 0h2v16h-2z" />
        </>
      )}
      {id === 'arcade' && (
        <>
          <path fill="#ffa6e8" d="M4 2h16v19H4z" />
          <path fill="#ff79c9" d="M12 3h8v18h-8z" />
          <path fill="#fff238" d="M6 3h12v3H6zm2 10h2v2H8zm4 0h2v2h-2z" />
          <path fill="#04bcf0" d="M6 6h12v6H6z" />
          <path fill="#0284c7" d="M12 7h6v5h-6z" />
          <path fill="#ff5252" d="M8 8h3v3H8zm-2 6h3v3H6z" />
          <path fill="#fffef7" d="M6 3h4v1H6zm1 4h2v2H7z" />
          <path
            fill="#20211d"
            d="M3 1h18v2H3zm-1 9h2v11H2zm18 0h2v11h-2zM3 21h18v2H3zM5 12h14v2H5z"
          />
        </>
      )}
      {id === 'bowling' && (
        <>
          <path fill="#fffef7" d="M8 3h7v16H8z" />
          <path fill="#bae6fd" d="M11 4h4v14h-4z" />
          <path fill="#ff5252" d="M8 7h7v2H8zm0 3h7v2H8z" />
          <path fill="#04bcf0" d="M2 12h7v7H2z" />
          <path fill="#0284c7" d="M6 13h3v6H6z" />
          <path fill="#fffef7" d="M9 4h2v1H9zm-6 9h2v2H3zm1 1h1v1H4zm3 0h1v1H7zm-1 2h1v1H6z" />
          <path
            fill="#20211d"
            d="M7 2h9v2H7zm-1 16h11v2H6zm-5-7h7v2H1zm0 7h7v2H1zM9 13h1v1H9zm2 0h1v1h-1zM4 14h1v1H4zm3 0h1v1H7zm-1 2h1v1H6z"
          />
        </>
      )}
      {id === 'badminton' && (
        <>
          <path fill="#fffef7" d="M6 3h11v9H6z" />
          <path fill="#bae6fd" d="M11 4h6v7h-6z" />
          <path fill="#04bcf0" d="M6 6h11v2H6z" />
          <path fill="#ff5252" d="M8 12h7v3H8z" />
          <path fill="#be123c" d="M12 13h3v2h-3z" />
          <path fill="#bc804b" d="M9 15h5v3H9zm2 3h2v3h-2z" />
          <path fill="#8d5b36" d="M12 15h2v6h-2z" />
          <path fill="#fffef7" d="M7 4h2v1H7zm2 8h2v1H9z" />
          <path fill="#20211d" d="M5 2h13v2H5zm0 8h13v2H5zm2 5h9v2H7zm3 3h3v2h-3z" />
        </>
      )}
      {id === 'skateboard' && (
        <>
          <path fill="#ffa6e8" d="M1 8h22v5H1z" />
          <path fill="#ff79c9" d="M1 10h22v3H1zm11-2h11v4H12z" />
          <path fill="#04bcf0" d="M3 9h18v2H3z" />
          <path fill="#fffef7" d="M3 8h6v1H3zm1 6h2v2H4zm12 0h2v2h-2z" />
          <path fill="#fff238" d="M4 13h4v4H4zm12 0h4v4h-4z" />
          <path fill="#facc15" d="M6 14h2v3H6zm12 0h2v3h-2z" />
          <path fill="#20211d" d="M0 7h24v2H0zm0 4h24v2H0zM3 13h5v4H3zm13 0h5v4h-5z" />
        </>
      )}
      {id === 'dice' && (
        <>
          <path fill="#fffef7" d="M3 3h18v18H3z" />
          <path fill="#bae6fd" d="M12 4h9v17h-9zm-9 9h18v8H3z" />
          <path fill="#ff5252" d="M9 9h6v6H9z" />
          <path fill="#be123c" d="M12 11h3v4h-3z" />
          <path fill="#fffef7" d="M10 10h2v2h-2zM4 4h4v1H4z" />
          <path fill="#20211d" d="M5 5h3v3H5zm11 0h3v3h-3zm-11 11h3v3H5zm11 0h3v3h-3z" />
          <path fill="#20211d" d="M2 2h20v2H2zm0 18h20v2H2zM2 3h2v18H2zm18 0h2v18h-2z" />
        </>
      )}
      {id === 'theater' && (
        <>
          <path fill="#fffef7" d="M3 4h18v16H3z" />
          <path fill="#bae6fd" d="M12 5h9v14h-9z" />
          <path fill="#ffa6e8" d="M4 10h3v3H4zm13 0h3v3h-3z" />
          <path fill="#fffef7" d="M4 4h4v1H4zm12 0h4v1h-4z" />
          <path
            fill="#20211d"
            d="M6 7h3v3H6zm9 0h3v3h-3zm-6 5h6v2H9zm-2 2h2v2H7zm8 0h2v2h-2zm-6 2h6v1H9z"
          />
          <path fill="#20211d" d="M4 3h16v2H4zm-2 2h2v14H2zm18 0h2v14h-2zM4 19h16v2H4z" />
        </>
      )}
      {id === 'gardening' && (
        <>
          <path fill="#2aeea4" d="M5 8h11v11H5z" />
          <path fill="#26c985" d="M10 9h6v10h-6z" />
          <path fill="#04bcf0" d="M15 10h4v2h-4zm3 2h3v6h-3zM1 10h4v2H1zm0 2h3v6H1z" />
          <path fill="#fffef7" d="M7 10h3v3H7zm2-6h7v4H9zM6 8h3v1H6zm11 3h1v1h-1z" />
          <path fill="#bc804b" d="M9 4h6v3H9z" />
          <path fill="#20211d" d="M4 7h13v2H4zm0 11h13v2H4zm9-15h5v2h-5zM0 9h5v2H0zm15 0h6v2h-6z" />
        </>
      )}
      {id === 'knitting' && (
        <>
          <path fill="#ffa6e8" d="M4 5h15v14H4z" />
          <path fill="#ff79c9" d="M6 7h11v10H6zm5 0h6v10h-6z" />
          <path fill="#bc804b" d="M1 2h5v4H1zm17 0h5v4h-5zM7 17h3v5H7zm7 0h3v5h-3z" />
          <path fill="#8d5b36" d="M3 3h3v3H3zm17 0h3v3h-3zm-11 16h2v3H9zm7 0h2v3h-2z" />
          <path fill="#fffef7" d="M8 9h5v2H8zm-3-3h3v1H5z" />
          <path
            fill="#20211d"
            d="M5 4h13v2H5zm-2 2h2v12H3zm15 0h2v12h-2zM5 19h13v2H5zM0 1h5v2H0zm18 0h5v2h-5z"
          />
        </>
      )}
      {id === 'telescope' && (
        <>
          <path fill="#04bcf0" d="M3 5h13v6H3z" />
          <path fill="#0284c7" d="M9 6h7v5H9z" />
          <path fill="#fff238" d="M14 4h5v8h-5z" />
          <path fill="#facc15" d="M16 5h3v7h-3z" />
          <path fill="#fffef7" d="M5 6h3v3H5zm10 0h2v3h-2z" />
          <path fill="#bc804b" d="M9 10h5v3H9zm-2 3h3v8H7zm7 0h3v8h-3z" />
          <path fill="#8d5b36" d="M12 11h2v2h-2zm2 4h2v6h-2z" />
          <path fill="#20211d" d="M2 4h15v2H2zm11-1h7v2h-7zM6 12h3v9H6zm7 0h3v9h-3z" />
        </>
      )}
      {id === 'microphone' && (
        <>
          <path fill="#bae6fd" d="M7 3h10v10H7z" />
          <path fill="#fffef7" d="M8 4h8v8H8zm0 0h2v1H8z" />
          <path fill="#20211d" d="M8 6h8v1H8zm0 2h8v1H8zm0 2h8v1H8z" />
          <path fill="#bc804b" d="M10 12h4v6h-4zm-4 6h12v2H6z" />
          <path fill="#8d5b36" d="M12 13h2v5h-2zm3 6h3v2h-3z" />
          <path
            fill="#20211d"
            d="M6 2h12v2H6zm-1 3h2v8H5zm12 0h2v8h-2zM6 13h12v2H6zm3 5h6v2H9zm-4 2h14v2H5z"
          />
        </>
      )}
      {id === 'swimming' && (
        <>
          <path fill="#04bcf0" d="M2 9h20v12H2z" />
          <path fill="#0284c7" d="M2 14h20v7H2z" />
          <path fill="#ff5252" d="M8 6h8v5H8z" />
          <path fill="#be123c" d="M12 7h4v4h-4z" />
          <path fill="#fff238" d="M5 8h4v2H5zm10 0h4v2h-4z" />
          <path fill="#fffef7" d="M4 11h5v2H4zm11 0h5v2h-5zm-6 3h6v2H9zM9 7h2v1H9z" />
          <path
            fill="#20211d"
            d="M7 5h10v2H7zm-3 3h2v11H4zm14 0h2v11h-2zM7 19h10v2H7zm2-9h6v2H9zm0 4h6v2H9z"
          />
        </>
      )}
      {id === 'yoga' && (
        <>
          <path fill="#c1a0ff" d="M2 16h20v5H2z" />
          <path fill="#7c3aed" d="M12 17h10v4h-10z" />
          <path fill="#ffa6e8" d="M8 5h8v7H8zm-3 6h14v4H5z" />
          <path fill="#ff79c9" d="M12 6h4v6h-4zm4 6h3v3h-3z" />
          <path fill="#fffef7" d="M10 7h3v3h-3zm-4 9h12v1H6zM9 5h2v1H9z" />
          <path fill="#26c985" d="M7 9h3v3H7zm7 0h3v3h-3z" />
          <path fill="#20211d" d="M1 15h22v2H1zm0 5h22v2H1zM7 4h10v2H7zm3 6h4v2h-4z" />
        </>
      )}
      {id === 'reading' && (
        <>
          <path fill="#26c985" d="M2 14h20v6H2z" />
          <path fill="#0d9977" d="M12 15h10v5h-10z" />
          <path fill="#fffef7" d="M3 5h8v10H3zm10 0h8v10h-8z" />
          <path
            fill="#bae6fd"
            d="M4 7h6v1H4zm0 2h6v1H4zm0 2h6v1H4zm10-4h6v1h-6zm0 2h6v1h-6zm0 2h6v1h-6z"
          />
          <path fill="#ff5252" d="M11 6h2v11h-2z" />
          <path fill="#be123c" d="M12 7h1v10h-1z" />
          <path fill="#fffef7" d="M3 5h3v1H3zm10 0h3v1h-3z" />
          <path fill="#20211d" d="M2 4h10v2H2zm10 0h10v2h-10zm-11 10h20v2H1zm0 4h20v2H1z" />
        </>
      )}
      {id === 'alarm' && (
        <>
          <path fill="#04bcf0" d="M4 5h16v14H4z" />
          <path fill="#0284c7" d="M13 6h7v13h-7z" />
          <path fill="#fffef7" d="M6 7h12v10H6zm-1-2h3v1H5z" />
          <path fill="#ff5252" d="M3 2h5v4H3zm13 0h5v4h-5z" />
          <path fill="#be123c" d="M6 3h2v3H6zm13 0h2v3h-2z" />
          <path fill="#fff238" d="M4 3h2v2H4zm14 0h2v2h-2zm-8 7h4v2h-4z" />
          <path
            fill="#20211d"
            d="M11 9h2v4h-2zm0 3h4v2h-4zM5 19h3v2H5zm11 0h3v2h-3zM4 4h16v2H4zm-2 2h2v12H2zm18 0h2v12h-2zM4 18h16v2H4zM2 1h6v2H2zm14 0h6v2h-6z"
          />
        </>
      )}
      {id === 'slippers' && (
        <>
          <path fill="#ffa6e8" d="M3 7h7v11H3zm11 0h7v11h-7z" />
          <path fill="#ff79c9" d="M7 8h3v10H7zm11 0h3v10h-3z" />
          <path fill="#fffef7" d="M4 8h5v5H4zm11 0h5v5h-5zm-1-1h2v1h-2zM3 7h2v1H3z" />
          <path fill="#ff5252" d="M5 9h3v3H5zm11 0h3v3h-3z" />
          <path fill="#bc804b" d="M3 17h7v3H3zm11 0h7v3h-7z" />
          <path fill="#8d5b36" d="M7 18h3v2H7zm11 0h3v2h-3z" />
          <path
            fill="#20211d"
            d="M3 6h7v2H3zm11 0h7v2h-7zm-1 11h9v2h-9zM2 17h9v2H2zm0-10h2v11H2zm18 0h2v11h-2zm-9 0h2v11h-2z"
          />
        </>
      )}
      {id === 'sofa' && (
        <>
          <path fill="#2aeea4" d="M2 7h20v11H2z" />
          <path fill="#26c985" d="M4 9h16v6H4zm10 0h6v6h-6z" />
          <path fill="#0d9977" d="M12 9h2v6h-2zm-9 3h3v5H3zm15 0h3v5h-3z" />
          <path fill="#ffa6e8" d="M5 10h4v4H5zm10 0h4v4h-4z" />
          <path fill="#ff79c9" d="M7 11h2v3H7zm10 1h2v3h-2z" />
          <path fill="#bc804b" d="M3 18h3v3H3zm15 0h3v3h-3z" />
          <path fill="#8d5b36" d="M5 19h1v2H5zm15 0h1v2h-1z" />
          <path fill="#fffef7" d="M3 7h4v1H3zm13 0h4v1h-4zm-11 4h1v1H5zm10 0h1v1h-1z" />
          <path
            fill="#20211d"
            d="M2 6h20v2H2zm-1 2h2v9H1zm20 0h2v9h-2zM2 17h20v2H2zm1 2h3v3H3zm15 0h3v3h-3z"
          />
        </>
      )}
      {id === 'plant' && (
        <>
          <path fill="#26c985" d="M7 3h10v8H7z" />
          <path fill="#0d9977" d="M13 4h4v7h-4z" />
          <path fill="#2aeea4" d="M5 6h5v5H5zm9 0h5v5h-5z" />
          <path fill="#fffef7" d="M10 4h2v2h-2zM5 6h2v1H5zm9 0h2v1h-2z" />
          <path fill="#bc804b" d="M5 11h14v8H5zm-1 0h16v3H4zm1 8h14v2H5z" />
          <path fill="#8d5b36" d="M13 12h6v7h-6zm4-1h3v3h-3z" />
          <path
            fill="#20211d"
            d="M6 2h12v2H6zm-3 8h18v2H3zm2 8h14v2H5zm-1-7h2v8H4zm14 0h2v8h-2zM6 9h12v2H6z"
          />
        </>
      )}
      {id === 'mug' && (
        <>
          <path fill="#fff238" d="M4 7h12v12H4z" />
          <path fill="#facc15" d="M10 8h6v11h-6zm5 2h5v6h-5z" />
          <path fill="#8d5b36" d="M5 8h10v4H5z" />
          <path
            fill="#fffef7"
            d="M7 9h3v2H7zm5 1h2v2h-2zm-7-6h2v3H5zm5 0h2v3h-2zM4 7h4v1H4zm13 4h2v4h-2z"
          />
          <path
            fill="#20211d"
            d="M3 6h14v2H3zm-1 2h2v11H2zm13 0h2v11h-2zm4 2h2v6h-2zM3 18h14v2H3zm13-8h5v2h-5zm0 6h5v2h-5z"
          />
        </>
      )}
      {id === 'umbrella' && (
        <>
          <path fill="#fff238" d="M3 5h18v9H3z" />
          <path fill="#facc15" d="M13 6h8v8h-8z" />
          <path fill="#ffa6e8" d="M7 5h10v9H7z" />
          <path fill="#ff79c9" d="M12 6h5v8h-5z" />
          <path fill="#ff5252" d="M10 1h4v4h-4z" />
          <path fill="#fffef7" d="M4 6h3v1H4zm8 0h3v1h-3zM4 16h2v3H4zm14-2h2v3h-2z" />
          <path fill="#bc804b" d="M11 13h2v6h-2zm-4 4h4v3H7zm-2-2h2v2H5z" />
          <path fill="#8d5b36" d="M12 14h1v5h-1zm-4 4h2v2H8z" />
          <path
            fill="#20211d"
            d="M3 4h18v2H3zm-2 9h22v2H1zm10 1h2v5h-2zm-4 4h4v2H7zm-2-2h2v2H5zm5-17h4v2h-4z"
          />
        </>
      )}
      {id === 'bathtub' && (
        <>
          <path fill="#fffef7" d="M2 9h20v9H2z" />
          <path fill="#bae6fd" d="M12 10h10v8h-10zm-9 7h18v2H3z" />
          <path fill="#04bcf0" d="M4 10h16v4H4z" />
          <path fill="#e5f9ff" d="M4 6h16v4H4zm-2 0h4v3H2zm12 1h3v2h-3z" />
          <path fill="#fff238" d="M14 6h4v3h-4zm-9 12h3v3H5zm11 0h3v3h-3z" />
          <path fill="#ff9e45" d="M13 7h2v2h-2zm-7 12h2v2H6zm11 0h2v2h-2z" />
          <path fill="#fffef7" d="M3 9h4v1H3zm12-2h2v1h-2zM4 7h2v1H4zm6 0h2v1h-2z" />
          <path
            fill="#20211d"
            d="M1 8h22v2H1zm0 9h22v2H1zm4 2h3v3H5zm11 0h3v3h-3zM2 9h2v9H2zm18 0h2v9h-2z"
          />
        </>
      )}
      {id === 'pillow' && (
        <>
          <path fill="#ffa6e8" d="M3 4h18v16H3z" />
          <path fill="#ff79c9" d="M12 5h9v15h-9zm-9 9h18v7H3z" />
          <path fill="#d64f94" d="M13 14h8v7h-8z" />
          <path fill="#fffef7" d="M8 8h4v3H8zm4 1h4v3h-4zM4 4h4v1H4zm12 0h4v1h-4z" />
          <path fill="#fff238" d="M10 10h4v4h-4z" />
          <path
            fill="#20211d"
            d="M4 3h16v2H4zm-2 2h2v14H2zm18 0h2v14h-2zM4 19h16v2H4zm3-8h3v2H7zm7 0h3v2h-3z"
          />
        </>
      )}
      {id === 'laundry' && (
        <>
          <path fill="#e8a64e" d="M3 10h18v11H3z" />
          <path fill="#bc804b" d="M12 11h9v10h-9zm-9 3h18v2H3zm0 4h18v2H3z" />
          <path fill="#04bcf0" d="M4 7h6v5H4zm10 1h6v4h-6z" />
          <path fill="#ffa6e8" d="M8 6h8v5H8z" />
          <path fill="#fff238" d="M11 5h4v3h-4z" />
          <path
            fill="#fffef7"
            d="M4 7h2v2H4zm6-2h2v2h-2zm-5 7h4v1H5zm10 0h4v1h-4zM5 2h2v2H5zm12 1h2v2h-2z"
          />
          <path
            fill="#20211d"
            d="M2 9h20v2H2zm0 10h20v2H2zM2 10h2v11H2zm18 0h2v11h-2zm-8-3h2v4h-2z"
          />
        </>
      )}
      {id === 'mirror' && (
        <>
          <path fill="#fff238" d="M5 2h14v13H5zm4 12h6v7H9z" />
          <path fill="#bc804b" d="M13 3h6v12h-6zm-3 12h4v7h-4z" />
          <path fill="#04bcf0" d="M7 4h10v9H7z" />
          <path fill="#bae6fd" d="M8 5h8v7H8z" />
          <path fill="#0284c7" d="M12 6h4v6h-4z" />
          <path fill="#fffef7" d="M8 5h3v4H8zm-2-2h3v1H6zm11 11h2v2h-2z" />
          <path
            fill="#20211d"
            d="M6 1h12v2H6zm-2 2h2v11H4zm14 0h2v11h-2zM6 14h12v2H6zm3 2h6v6H9zm-2 5h10v2H7z"
          />
        </>
      )}
      {id === 'window' && (
        <>
          <path fill="#fffef7" d="M3 3h18v18H3z" />
          <path fill="#04bcf0" d="M4 4h7v7H4zm9 0h7v7h-7zm-9 9h7v7H4zm9 0h7v7h-7z" />
          <path fill="#0284c7" d="M8 5h3v6H8zm9 0h3v6h-3zm-9 9h3v6H8zm9 0h3v6h-3z" />
          <path fill="#fff238" d="M4 4h3v9H4zm14 0h3v9h-3z" />
          <path fill="#fffef7" d="M5 5h2v2H5zm9 0h2v2h-2zm-8 4h3v2H6zm9 4h3v2h-3z" />
          <path fill="#bc804b" d="M11 3h2v18h-2zM3 11h18v2H3z" />
          <path fill="#20211d" d="M2 2h20v2H2zm0 18h20v2H2zM2 3h2v18H2zm18 0h2v18h-2z" />
        </>
      )}
      {id === 'teapot' && (
        <>
          <path fill="#ff5252" d="M5 7h14v11H5z" />
          <path fill="#be123c" d="M13 8h6v10h-6zm4 2h4v5h-4z" />
          <path fill="#fffef7" d="M7 9h10v5H7zm2-6h6v3H9zm-8 7h4v4H1z" />
          <path fill="#fff238" d="M9 1h6v2H9zm-4 7h3v1H5z" />
          <path fill="#ffa6e8" d="M9 10h6v3H9z" />
          <path
            fill="#20211d"
            d="M17 9h5v6h-5zM1 10h5v4H1zM4 6h16v2H4zm1 11h14v2H5zm11-6h5v4h-5zm-15 1h4v2H1zm8-10h6v2H9z"
          />
        </>
      )}
      {id === 'honey' && (
        <>
          <path fill="#bc804b" d="M6 3h12v4H6zm7-1h3v3h-3z" />
          <path fill="#8d5b36" d="M13 4h5v3h-5z" />
          <path fill="#facc15" d="M4 6h16v14H4z" />
          <path fill="#e8a64e" d="M12 7h8v13h-8z" />
          <path fill="#fff238" d="M6 8h12v7H6zm7-6h2v9h-2z" />
          <path fill="#fffef7" d="M7 12h10v4H7zm-2-5h3v1H5zm8-5h2v2h-2z" />
          <path
            fill="#20211d"
            d="M5 2h14v2H5zm-2 4h18v2H3zm1 13h16v2H4zm-2-10h2v11H2zm18 0h2v11h-2z"
          />
        </>
      )}
      {id === 'cookie' && (
        <>
          <path fill="#e8a64e" d="M3 4h18v16H3z" />
          <path fill="#bc804b" d="M12 5h9v15h-9zm-7 3h14v10H5z" />
          <path fill="#8d5b36" d="M6 7h3v3H6zm7 1h3v3h-3zm-4 3h3v3H9zm-3 3h3v3H6zm7 0h3v3h-3z" />
          <path fill="#20211d" d="M7 8h2v2H7zm7 1h2v2h-2zm-4 3h2v2h-2zm-3 3h2v2H7zm7 0h2v2h-2z" />
          <path fill="#fffef7" d="M9 5h3v1H9zm4 7h1v1h-1zM4 4h4v1H4z" />
          <path
            fill="#20211d"
            d="M5 3h14v2H5zm-3 3h2v12H2zm18 0h2v12h-2zM5 19h14v2H5zm11-15h4v4h-4z"
          />
        </>
      )}
      {id === 'jam' && (
        <>
          <path fill="#ff5252" d="M5 3h14v5H5zm-1 4h16v13H4z" />
          <path fill="#be123c" d="M13 8h7v12h-7z" />
          <path fill="#ffa6e8" d="M5 3h4v4H5zm6 0h4v4h-4z" />
          <path fill="#fffef7" d="M6 10h12v6H6zm-1-6h3v1H5z" />
          <path fill="#ff5252" d="M9 12h4v3H9z" />
          <path fill="#26c985" d="M10 11h2v1h-2z" />
          <path
            fill="#20211d"
            d="M4 2h16v2H4zm-2 5h20v2H2zm1 12h18v2H3zm-1-9h2v10H2zm18 0h2v10h-2z"
          />
        </>
      )}
      {id === 'sunflower' && (
        <>
          <path fill="#fff238" d="M4 4h16v16H4z" />
          <path fill="#facc15" d="M7 3h10v18H7zm-4 4h18v10H3z" />
          <path fill="#8d5b36" d="M7 7h10v10H7z" />
          <path fill="#5c3a21" d="M11 8h6v9h-6z" />
          <path fill="#fffef7" d="M8 8h3v3H8zM5 4h2v1H5zm12 0h2v1h-2z" />
          <path fill="#20211d" d="M8 8h8v8H8zm2 8h2v6h-2z" />
          <path fill="#26c985" d="M10 16h2v6h-2zm3 2h4v3h-4z" />
          <path fill="#2aeea4" d="M14 18h2v2h-2z" />
          <path fill="#20211d" d="M6 2h12v2H6zm-4 4h2v12H2zm18 0h2v12h-2zM6 20h12v2H6z" />
        </>
      )}
      {id === 'tulip' && (
        <>
          <path fill="#ff5252" d="M5 3h14v10H5z" />
          <path fill="#be123c" d="M13 4h6v9h-6z" />
          <path fill="#ffa6e8" d="M7 5h4v5H7zm5 0h4v5h-4z" />
          <path fill="#fffef7" d="M9 3h6v5H9zm-3 2h2v1H6z" />
          <path fill="#26c985" d="M10 11h3v10h-3zm-5 3h4v5H5zm7 2h4v5h-4z" />
          <path fill="#2aeea4" d="M6 14h2v3H6zm8 2h2v3h-2z" />
          <path
            fill="#20211d"
            d="M4 2h16v2H4zm-1 9h18v2H3zm6 0h4v10H9zm-4 2h4v2H5zm10 2h4v2h-4zM3 4h2v8H3zm16 0h2v8h-2z"
          />
        </>
      )}
      {id === 'match' && (
        <>
          <path fill="#bc804b" d="M3 7h17v12H3zm1 1h15v9H4z" />
          <path fill="#8d5b36" d="M12 8h8v11h-8z" />
          <path fill="#fffef7" d="M5 9h13v7H5zM4 7h3v1H4z" />
          <path fill="#e8a64e" d="M1 12h11v3H1z" />
          <path fill="#ff5252" d="M11 11h4v5h-4z" />
          <path fill="#fff238" d="M14 9h4v5h-4zm-1-3h3v3h-3z" />
          <path fill="#fffef7" d="M14 7h2v2h-2z" />
          <path fill="#20211d" d="M2 6h19v2H2zm0 12h19v2H2zM1 11h12v2H1zm10 0h4v5h-4z" />
        </>
      )}
      {id === 'luggage' && (
        <>
          <path fill="#e8a64e" d="M3 6h18v15H3z" />
          <path fill="#bc804b" d="M12 7h9v14h-9zm-6 0h3v14H6zm7 0h3v14h-3zm-5-5h6v5H8z" />
          <path
            fill="#8d5b36"
            d="M10 2h4v4h-4zm-6 4h3v3H4zm14 0h3v3h-3zm-14 11h3v3H4zm14 0h3v3h-3z"
          />
          <path fill="#fff238" d="M6 10h3v3H6zm7 0h3v3h-3z" />
          <path fill="#fffef7" d="M4 7h3v1H4zm13 0h3v1h-3zM8 3h2v1H8z" />
          <path
            fill="#20211d"
            d="M2 5h20v2H2zm0 15h20v2H2zm5-19h10v2H7zm-6 8h2v11H1zm20 0h2v11h-2z"
          />
        </>
      )}
      {id === 'ticket' && (
        <>
          <path fill="#ffa6e8" d="M2 6h20v12H2z" />
          <path fill="#ff79c9" d="M12 7h10v11h-10z" />
          <path fill="#fffef7" d="M4 8h16v8H4zm-3 3h3v2H1zm19 0h3v2h-3zM3 6h3v1H3z" />
          <path fill="#fff238" d="M9 9h5v5H9zm2-2h2v2h-2zm-2 3h2v2H9zm4 0h2v2h-2zm-1 3h2v2h-2z" />
          <path fill="#ff5252" d="M10 10h3v3h-3z" />
          <path
            fill="#20211d"
            d="M1 5h22v2H1zm0 12h22v2H1zM1 6h2v4H1zm20 0h2v4h-2zm-20 7h2v4H1zm20 0h2v4h-2zM8 8h1v8H8z"
          />
        </>
      )}
    </svg>
  )
}
