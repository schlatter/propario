/**
 * What Propario does, told as the way to a purchase decision: collect, set requirements, sort
 * out by swiping, compare, settle it in duels (sizes to scale), decide together – each with a
 * small still made of the app's own parts and the demo's invented sideboards. Signed out it is the start page (with the sign-in in the opening); signed in it is
 * "What Propario can do" in the menu. Either way it leads into the demo (src/demo.ts).
 */
import type { ReactNode } from 'react'
import { isDemo, startDemo } from '../demo'
import { useI18n } from '../i18n'
import { PersonFigure } from '../ui/PersonFigure'
import { Glyph } from '../ui/Glyph'

export function Overview({ signIn }: { signIn?: ReactNode }) {
  const { m, locale, setLocale, fmt } = useI18n()
  const o = m.overview
  const demo = isDemo()
  const tryDemo = !demo && (
    <button type="button" className="btn big" onClick={startDemo}>
      {o.tryDemo}
    </button>
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
          {!signIn && <div className="row">{tryDemo}</div>}
        </div>
        {signIn ? (
          <div className="overview-signin">
            {signIn}
            {tryDemo && (
              <div className="overview-demo">
                <p className="muted small">{o.demoHint}</p>
                {tryDemo}
              </div>
            )}
          </div>
        ) : (
          <figure className="still still-card" aria-hidden="true">
            <ProductStill fmt={fmt} />
          </figure>
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
        <Step n={4} title={o.s4Title} text={o.s4Text}>
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
        <Step n={5} title={o.s5Title} text={o.s5Text}>
          <div className="still-duel">
            <b className="still-duel-question">{m.duel.question}</b>
            <SizeStill room={o.room} />
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
        </div>
      </section>

      <section className="overview-closing" aria-labelledby="overview-closing">
        <h2 id="overview-closing">{o.closingTitle}</h2>
        <p className="overview-lead">{demo ? o.inDemo : o.closingText}</p>
        {tryDemo}
      </section>
    </main>
  )
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <li className="overview-step">
      <div className="overview-step-words">
        <span className="overview-step-n" aria-hidden="true">
          {String(n).padStart(2, '0')}
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <figure className="still" aria-hidden="true">
        {children}
      </figure>
    </li>
  )
}

/**
 * The sizes to scale as in a duel (src/pages/project/SizeCompare.tsx), drawn once: 1 px = 1 cm.
 * Arvika (160 × 80) fits the 180 cm niche, Mira (200 × 78) sticks out on both sides.
 */
function SizeStill({ room }: { room: string }) {
  const floor = 200
  return (
    <svg className="still-size" viewBox="0 20 500 216">
      <defs>
        <pattern id="still-over" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      <PersonFigure transform={`translate(8 ${floor - 175})`} />
      <rect className="size-box pic" x="85" y={floor - 80} width="160" height="80" />
      <image href="/demo/sideboard-arvika.svg" x="85" y={floor - 80} width="160" height="80" preserveAspectRatio="xMidYMax meet" />
      <rect className="size-line" x="85" y={floor - 80} width="160" height="80" />
      <rect className="size-box pic" x="290" y={floor - 78} width="200" height="78" />
      <image href="/demo/sideboard-mira.svg" x="290" y={floor - 78} width="200" height="78" preserveAspectRatio="xMidYMax meet" />
      <rect fill="url(#still-over)" x="290" y={floor - 78} width="10" height="78" />
      <rect fill="url(#still-over)" x="480" y={floor - 78} width="10" height="78" />
      <rect className="size-line" x="290" y={floor - 78} width="200" height="78" />
      {[75, 255, 300, 480].map((x) => (
        <line key={x} className="size-niche" x1={x} x2={x} y1={floor} y2={floor - 100} />
      ))}
      <line className="still-size-floor" x1="0" x2="500" y1={floor} y2={floor} />
      <text x="165" y={floor - 108} textAnchor="middle">
        {room}
      </text>
      <text x="165" y={floor + 24} textAnchor="middle">
        Arvika · 160 cm
      </text>
      <text x="390" y={floor + 24} textAnchor="middle" className="over">
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
