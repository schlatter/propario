/**
 * Where "Share → Propario" lands (manifest `share_target`): the shared product link goes into
 * a comparison of your choice – no second entry when it is already there – and its details open
 * while picture and data come from the shop page in the background.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { addProduct } from '../db/repo'
import { filledLabels } from '../domain/display'
import { sameLink, sharedLink } from '../domain/links'
import { hostOf } from '../domain/values'
import { useI18n } from '../i18n'
import { ImageError, loadProductImage } from '../images'
import { rolesOf } from '../sync'
import { useToast } from '../ui/Dialog'

export function SharePage() {
  const { m, fmt } = useI18n()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const link = sharedLink({ url: params.get('url'), text: params.get('text'), title: params.get('title') })
  const title = (params.get('title') ?? '').trim()
  // Comparisons one may add to, the most recently worked on first; archived ones last.
  const projects = useLiveQuery(async () => {
    const roles = await rolesOf()
    const all = await db.projects.orderBy('updatedAt').reverse().toArray()
    return all.filter((p) => roles[p.id] && roles[p.id] !== 'viewer').sort((a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'))
  }, [])

  const addTo = async (projectId: string) => {
    if (!link) return
    const products = await db.products.where('projectId').equals(projectId).toArray()
    const existing = products.find((p) => sameLink(p.url, link))
    if (existing) {
      toast(m.shareTarget.already)
      return navigate(`/p/${projectId}?product=${existing.id}`, { replace: true })
    }
    const created = await addProduct(projectId, { url: link, retailer: hostOf(link) })
    const tell = (filled: string[] | undefined) => filled?.length && toast(m.pageImport.filled(filledLabels(filled, m)))
    void loadProductImage(created)
      .then((r) => tell(r.filled))
      .catch((e) => tell(e instanceof ImageError ? e.filled : undefined))
    navigate(`/p/${projectId}?product=${created.id}`, { replace: true })
  }

  if (!link)
    return (
      <main>
        <h1>{m.shareTarget.title}</h1>
        <p className="muted">{m.shareTarget.noLink}</p>
        <Link className="btn" to="/">
          {m.shareTarget.back}
        </Link>
      </main>
    )

  return (
    <main>
      <h1>{m.shareTarget.title}</h1>
      <p className="share-what">
        {title && <b>{title}</b>}
        <span className="muted">{hostOf(link)}</span>
      </p>
      <h2 className="share-choose">{m.shareTarget.choose}</h2>
      {projects === undefined ? null : projects.length === 0 ? (
        <p className="muted">{m.shareTarget.none}</p>
      ) : (
        <ul className="share-list">
          {projects.map((p) => (
            <li key={p.id}>
              <button type="button" className="share-pick" onClick={() => addTo(p.id)}>
                <span className="share-name">{p.name}</span>
                <span className="muted small">{[p.category, m.status[p.status], fmt.relative(p.updatedAt)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link className="btn ghost" to="/">
        {m.common.cancel}
      </Link>
    </main>
  )
}
