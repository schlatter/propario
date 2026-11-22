/** A small set of hand-drawn line glyphs (no icon library). */
const paths = {
  plus: 'M8 3v10M3 8h10',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  moreVertical: 'M8 3.5h.01M8 8h.01M8 12.5h.01',
  close: 'M4 4l8 8M12 4l-8 8',
  chevronLeft: 'M10 3L5 8l5 5',
  chevronRight: 'M6 3l5 5-5 5',
  up: 'M4 10l4-4 4 4',
  down: 'M4 6l4 4 4-4',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6L14 14',
  out: 'M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5',
  panel: 'M2.5 3h11v10h-11zM9.5 3v10',
  columns: 'M2.5 3h11v10h-11zM6.2 3v10M9.8 3v10',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  download: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10',
  upload: 'M8 10.5v-8M4.5 6L8 2.5 11.5 6M3 13.5h10',
  check: 'M3 8.5l3.2 3L13 4.5',
  cross: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3',
  edit: 'M10.5 3l2.5 2.5L6 12.5H3.5V10z',
  flag: 'M4 14V2.5M4 3h7.5l-1.5 2.5L11.5 8H4',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  share:
    'M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.8 13.5c.3-2.2 1.8-3.6 3.7-3.6s3.4 1.4 3.7 3.6M10.8 7.4a1.9 1.9 0 1 0 0-3.8M11.8 9.9c1.3.4 2.2 1.7 2.4 3.6',
  image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3.2-3 2.6 2.4 1.9-1.6 3.3 2.9M10.2 6.2h.01',
  crop: 'M4.5 1.5v10h10M1.5 4.5h10v10',
  recentre: 'M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  turnLeft: 'M3.5 7.5a4.8 4.8 0 1 1 1.4 4.6M3.5 3.5v4h4',
  turnRight: 'M12.5 7.5a4.8 4.8 0 1 0-1.4 4.6M12.5 3.5v4h-4',
  cube: 'M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8zM2.5 4.8L8 7.8l5.5-3M8 7.8v6.4',
  thumbUp: 'M5 7v6.5H2.5V7zM5 7.2l2.6-4.4c.6-.9 1.9-.5 1.9.6V6h3c.9 0 1.5.8 1.3 1.6l-1 4.6c-.2.7-.8 1.3-1.5 1.3H5',
  thumbDown: 'M5 9V2.5H2.5V9zM5 8.8l2.6 4.4c.6.9 1.9.5 1.9-.6V10h3c.9 0 1.5-.8 1.3-1.6l-1-4.6c-.2-.7-.8-1.3-1.5-1.3H5',
  neutral: 'M8 13.5A5.5 5.5 0 1 0 8 2.5a5.5 5.5 0 0 0 0 11zM5.5 8h5',
  euro: 'M11.5 4.3A4.4 4.4 0 1 0 11.5 11.7M3 7h6.5M3 9.2h6.5',
  duel: 'M2.5 4.5h4.5v7H2.5zM9 4.5h4.5v7H9zM8 2.5v11',
  swipe: 'M5.5 3.5h5v9h-5zM3.5 6L2 8l1.5 2M12.5 6L14 8l-1.5 2',
  // Not decided yet: a dashed ring around a question mark.
  undecided:
    'M13.71 9.01A5.8 5.8 0 0 1 12.75 11.33M11.33 12.75A5.8 5.8 0 0 1 9.01 13.71M6.99 13.71A5.8 5.8 0 0 1 4.67 12.75M3.25 11.33A5.8 5.8 0 0 1 2.29 9.01M2.29 6.99A5.8 5.8 0 0 1 3.25 4.67M4.67 3.25A5.8 5.8 0 0 1 6.99 2.29M9.01 2.29A5.8 5.8 0 0 1 11.33 3.25M12.75 4.67A5.8 5.8 0 0 1 13.71 6.99M6.5 6.6a1.5 1.5 0 1 1 2.1 1.4c-.4.2-.6.5-.6.9v.3M8 10.8h.01',
  info: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.3V11M8 5h.01',
}

export type GlyphName = keyof typeof paths | 'star'

export function Glyph({ name, title }: { name: GlyphName; title?: string }) {
  if (name === 'star') {
    return (
      <svg className="glyph" viewBox="0 0 16 16" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
        {title && <title>{title}</title>}
        <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg
      className="glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' || name === 'moreVertical' || name === 'grip' ? 2.6 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={paths[name]} />
    </svg>
  )
}
