/**
 * What Propario does, told as the way to a purchase decision: collect, set requirements, compare,
 * sort out by swiping, settle it in duels (sizes to scale), decide together – each with a small
 * still made of the app's own parts and the demo's invented sideboards. Signed out it is the start
 * page (with the sign-in in the opening); signed in it is "What Propario can do" in the menu.
 * Either way the opening leads into the demo (src/demo.ts).
 */
import type { ReactNode } from 'react'
import { isDemo, startDemo } from '../demo'
import { useI18n } from '../i18n'
import { PersonFigure } from '../ui/PersonFigure'
import { Glyph } from '../ui/Glyph'
import { ProjectLinks } from '../ui/ProjectLinks'

export function Overview({ signIn }: { signIn?: ReactNode }) {
  const { m, locale, setLocale, fmt } = useI18n()
  const o = m.overview
  const demo = isDemo()
  // See for yourself: the invented comparisons, right where one decides to sign in or not.
  const demoBox = !demo && (
    <section className="overview-demo-box" aria-labelledby="overview-demo-title">
      <h2 id="overview-demo-title">{o.closingTitle}</h2>
      <button type="button" className="btn" onClick={startDemo}>
        {o.tryDemo}
      </button>
    </section>
  )

  return (
    <main id="main" className={`overview${signIn ? ' landing' : ''}`}>
      {signIn && (
        <header className="overview-top">
          <span className="brand">
            <img className="brand-mark" src="/favicon.svg" alt="" width={24} height={24} />
            <span className="brand-text">{m.app.name}</span>
          </span>
          <nav className="row" aria-label={m.nav.language}>
            {(['de', 'en'] as const).map((l) => (
              <button key={l} type="button" className="link-btn" aria-pressed={locale === l} lang={l} onClick={() => setLocale(l)}>
                {l === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </nav>
        </header>
      )}

      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-words">
          <h1 id="overview-title">{o.title}</h1>
          <p className="overview-lead">{o.lead}</p>
        </div>
        {signIn ? (
          <div className="overview-signin">
            {signIn}
            {demoBox}
          </div>
        ) : (
          <div className="overview-signin">
            {/* The app's own mark – the product example follows in step 1. */}
            <div className="overview-brandmark" aria-hidden="true">
              <img src="/favicon.svg" alt="" width={88} height={88} />
              <span>{m.app.name}</span>
            </div>
            {demoBox}
          </div>
        )}
      </section>

      {/* On a phone a row to swipe: focusable, so the keyboard can scroll it too. */}
      <ol className="overview-steps" tabIndex={0} aria-label={o.stepsLabel}>
        <Step n={1} title={o.s1Title} text={o.s1Text}>
          <div className="still-link">shop.example/nordhaus-arvika</div>
          <ProductStill fmt={fmt} />
        </Step>
        <Step n={2} title={o.s2Title} text={o.s2Text}>
          <ul className="still-reqs">
            {o.reqs.map(([prio, label, result], i) => (
              <li key={i}>
                <span className={`still-prio p-${i}`}>{prio}</span>
                <span className="still-req">{label}</span>
                <span className={`still-check ${result}`}>{result === 'pass' ? '✓' : result === 'fail' ? '✗' : '?'}</span>
              </li>
            ))}
          </ul>
          <p className="still-fit">
            {m.check.fit} <b>86 %</b>
          </p>
        </Step>
        <Step n={3} title={o.s3Title} text={o.s3Text}>
          <div className="still-tools">
            <span className="still-seg">
              <span className="on">{m.size.views.front}</span>
              <span>{m.size.views.side}</span>
              <span>{m.size.views.top}</span>
            </span>
            <span className="still-chip">
              <Glyph name="cube" /> 3D
            </span>
          </div>
          <BesideStill />
          <table className="still-compare">
            <thead>
              <tr>
                <th />
                {['Arvika', 'Kanto', 'Linea'].map((n, i) => (
                  <th key={n} scope="col">
                    <img src={['/demo/sideboard-arvika.svg', '/demo/sideboard-kanto.svg', '/demo/sideboard-linea.svg'][i]} alt="" />
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{m.field.price}</th>
                <td>{fmt.money(849)}</td>
                <td className="best">{fmt.money(549)}</td>
                <td>{fmt.money(779)}</td>
              </tr>
              <tr>
                <th scope="row">{o.depth}</th>
                <td>42 cm</td>
                <td>40 cm</td>
                <td className="best">38 cm</td>
              </tr>
              <tr>
                <th scope="row">Soft-Close</th>
                <td>{m.common.yes}</td>
                <td className="differs">{m.common.no}</td>
                <td>{m.common.yes}</td>
              </tr>
            </tbody>
          </table>
        </Step>
        <Step n={4} title={o.s4Title} text={o.s4Text}>
          <div className="still-swipe">
            <div className="still-swipe-card">
              <img src="/demo/sideboard-kanto.svg" alt="" />
              <b>Fjell Kanto</b>
              <span className="still-price">{fmt.money(549)}</span>
            </div>
            <div className="still-swipe-buttons">
              <span className="vote dislike">
                <Glyph name="thumbDown" />
              </span>
              <span className="vote neutral">
                <Glyph name="neutral" />
              </span>
              <span className="vote like">
                <Glyph name="thumbUp" />
              </span>
            </div>
            <span className="still-swipe-count">{o.swipeCount}</span>
          </div>
        </Step>
        <Step n={5} title={o.s5Title} text={o.s5Text}>
          <div className="still-duel">
            <b className="still-duel-question">{m.duel.question}</b>
            <span className="still-seg">
              <span>{m.size.layouts.beside}</span>
              <span className="on">{m.size.layouts.overlay}</span>
            </span>
            <OverlayStill room={o.room} />
            <div className="still-duel-choices">
              <span>
                <Glyph name="check" /> Arvika
              </span>
              <span>
                <Glyph name="check" /> Mira
              </span>
            </div>
          </div>
        </Step>
        <Step n={6} title={o.s6Title} text={o.s6Text}>
          <div className="still-decision">
            <span className="still-decision-label">{m.project.decision}</span>
            <b>Nordhaus Arvika</b>
          </div>
          <ul className="still-ratings">
            <li>
              <span>Ada</span>
              <span className="vote like">
                <Glyph name="thumbUp" /> {m.verdict.like}
              </span>
            </li>
            <li>
              <span>Grace</span>
              <span className="vote neutral">
                <Glyph name="neutral" /> {m.verdict.neutral}
              </span>
            </li>
          </ul>
          <p className="still-dates small">{o.returnLine}</p>
        </Step>
      </ol>

      <section className="overview-bands">
        <div className="overview-band" aria-labelledby="overview-ai">
          <h2 id="overview-ai">{o.aiTitle}</h2>
          <p>{o.aiText}</p>
          <pre className="still-md" aria-hidden="true">
            {`| Link | ${m.field.model} | ${m.field.price} |\n| --- | --- | --- |\n| shop.example/… | Arvika | 829 |`}
          </pre>
        </div>
        <div className="overview-band" aria-labelledby="overview-trust">
          <h2 id="overview-trust">{o.trustTitle}</h2>
          <ul className="overview-trust">
            {o.trust.map((line) => (
              <li key={line}>
                <Glyph name="check" /> {line}
              </li>
            ))}
          </ul>
          <ProjectLinks />
        </div>
      </section>
    </main>
  )
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <li className="overview-step">
      <div className="overview-step-words">
        <h2>
          <span className="overview-step-n" aria-hidden="true">
            {n}
          </span>
          {title}
        </h2>
        <p>{text}</p>
      </div>
      <figure className="still" aria-hidden="true">
        {children}
      </figure>
    </li>
  )
}

const hatch = (
  <defs>
    <pattern id="still-over" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" />
    </pattern>
  </defs>
)

/** The sizes to scale side by side, as at the top of a comparison: 1 px = 1 cm, beside a person. */
function BesideStill() {
  const floor = 200
  const items = [
    { name: 'Arvika', file: 'arvika', x: 70, w: 160, h: 80 },
    { name: 'Kanto', file: 'kanto', x: 255, w: 150, h: 85 },
    { name: 'Linea', file: 'linea', x: 430, w: 170, h: 72 },
  ]
  return (
    <svg className="still-size" viewBox="0 18 610 210">
      <PersonFigure transform={`translate(8 ${floor - 175})`} />
      {items.map((i) => (
        <g key={i.name}>
          <rect className="size-box pic" x={i.x} y={floor - i.h} width={i.w} height={i.h} />
          <image href={`/demo/sideboard-${i.file}.svg`} x={i.x} y={floor - i.h} width={i.w} height={i.h} preserveAspectRatio="xMidYMax meet" />
          <rect className="size-line" x={i.x} y={floor - i.h} width={i.w} height={i.h} />
          <text x={i.x + i.w / 2} y={floor + 22} textAnchor="middle">
            {i.name}
          </text>
        </g>
      ))}
      <line className="still-size-floor" x1="0" x2="610" y1={floor} y2={floor} />
    </svg>
  )
}

/**
 * A duel's sizes one over the other (src/pages/project/SizeCompare.tsx), drawn once: Arvika
 * (160 cm) fits the 180 cm niche, Mira (200 cm) laid over it sticks out on both sides.
 */
function OverlayStill({ room }: { room: string }) {
  const floor = 200
  return (
    <svg className="still-size" viewBox="0 20 330 236">
      {hatch}
      <PersonFigure transform={`translate(8 ${floor - 175})`} />
      <g className="size-body t0">
        <rect className="size-box" x="120" y={floor - 80} width="160" height="80" />
        <rect className="size-line" x="120" y={floor - 80} width="160" height="80" />
      </g>
      <g className="size-body t1">
        <rect fill="url(#still-over)" x="100" y={floor - 78} width="10" height="78" />
        <rect fill="url(#still-over)" x="290" y={floor - 78} width="10" height="78" />
        <rect className="size-line" x="100" y={floor - 78} width="200" height="78" />
      </g>
      {[110, 290].map((x) => (
        <line key={x} className="size-niche" x1={x} x2={x} y1={floor} y2={floor - 100} />
      ))}
      <line className="still-size-floor" x1="0" x2="330" y1={floor} y2={floor} />
      <text x="200" y={floor - 108} textAnchor="middle">
        {room}
      </text>
      <g className="size-body t0">
        <rect className="size-box" x="128" y={floor + 12} width="14" height="9" />
        <rect className="size-line" x="128" y={floor + 12} width="14" height="9" />
      </g>
      <text x="148" y={floor + 21}>
        Arvika · 160 cm
      </text>
      <g className="size-body t1">
        <rect className="size-line" x="128" y={floor + 28} width="14" height="9" />
      </g>
      <text x="148" y={floor + 37} className="over">
        Mira · 200 cm
      </text>
    </svg>
  )
}

function ProductStill({ fmt }: { fmt: { money: (n: number) => string } }) {
  return (
    <div className="still-product">
      <img src="/demo/sideboard-arvika.svg" alt="" />
      <div className="still-product-body">
        <b>Nordhaus Arvika</b>
        <span className="still-price">{fmt.money(849)}</span>
        <span className="still-chips">
          <span>160 × 80 × 42 cm</span>
          <span>Soft-Close</span>
        </span>
      </div>
      <span className="still-fav" />
    </div>
  )
}
