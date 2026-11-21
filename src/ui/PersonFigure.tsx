/**
 * The reference person beside products to scale: a plain pictogram 175 units tall and 45 wide,
 * feet at y = 175. Drawn in human proportions – head about an eighth of the height, the crotch at
 * about 46 %, hands reaching to mid-thigh – so the sizes next to it read right.
 */
export function PersonFigure({ transform }: { transform?: string }) {
  return (
    <g className="size-person" transform={transform}>
      <circle cx="22.5" cy="12.5" r="11.5" />
      <rect x="9.5" y="27" width="26" height="68" rx="9" />
      <rect x="1.5" y="29" width="7" height="70" rx="3.5" />
      <rect x="36.5" y="29" width="7" height="70" rx="3.5" />
      <rect x="10" y="86" width="12" height="89" rx="5" />
      <rect x="23" y="86" width="12" height="89" rx="5" />
    </g>
  )
}
