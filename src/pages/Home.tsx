import { isFavorite } from '../domain/verdict'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { createProject, deleteProject, duplicateProject, updateProject, uniqueProjectName } from '../db/repo'
import { PROJECT_STATUSES, type Product, type Project, type ProjectStatus } from '../db/types'
import { exportComparison } from '../hooks'
import { ExportChoice } from '../ui/ExportChoice'
import { useI18n } from '../i18n'
import { useMe } from '../session'
import { productImage } from '../images'
import { Modal, useConfirm, useToast } from '../ui/Dialog'
import { Glyph } from '../ui/Glyph'
import { Field } from '../ui/inputs'
import { Stage } from '../ui/Marks'
import { Menu } from '../ui/Menu'
import { isNew, productName } from '../domain/display'
import { openReturns } from '../domain/purchase'

export function HomePage() {
  const { m } = useI18n()
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dialog, setDialog] = useState<{ project: Project | null } | null>(null)
  const navigate = useNavigate()

  const byProject = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of products ?? []) {
      const list = map.get(p.projectId) ?? []
      list.push(p)
      map.set(p.projectId, list)
    }
    return map
  }, [products])

  const categories = useMemo(() => [...new Set((projects ?? []).map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [projects])

  const q = query.trim().toLowerCase()
  const visible = (projects ?? [])
    .filter((p) => (status ? p.status === status : p.status !== 'archived'))
    .filter((p) => !category || p.category === category)
    .map((p) => {
      const items = byProject.get(p.id) ?? []
      if (!q) return { p, items, hits: 0 }
      const inProject = `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)
      const hits = items.filter((i) => `${i.brand} ${i.model} ${i.retailer} ${i.comments}`.toLowerCase().includes(q)).length
      return inProject || hits ? { p, items, hits } : null
    })
    .filter((x): x is { p: Project; items: Product[]; hits: number } => x !== null)

  const activeFilters = (category ? 1 : 0) + (status ? 1 : 0)

  if (!projects) return <main aria-busy="true" />

  return (
    <main>
      <div className="page-head">
        <h1>{m.home.title}</h1>
        <span className="count">{projects.filter((p) => p.status !== 'archived').length}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setDialog({ project: null })}>
          <Glyph name="plus" /> {m.home.newComparison}
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <h2>{m.home.emptyTitle}</h2>
          <p>{m.home.emptyText}</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn primary" onClick={() => setDialog({ project: null })}>
              <Glyph name="plus" /> {m.home.newComparison}
            </button>
            <Link className="btn" to="/import">
              {m.home.importExcel}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <Glyph name="search" />
              <span className="sr-only">{m.common.search}</span>
              <input className="input" type="search" placeholder={m.home.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {/* On a phone category and status fold behind the filter button, as in the products. */}
            <button
              type="button"
              className="btn sm filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="home-filters"
              aria-label={activeFilters ? m.filter.toggleActive(activeFilters) : m.filter.toggle}
              title={m.filter.toggle}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Glyph name="filter" />
              {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
            </button>
            <div id="home-filters" className={`row filter-chips${filtersOpen ? ' open' : ''}`}>
              <label>
                <span className="sr-only">{m.home.category}</span>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto' }}>
                  <option value="">{m.home.allCategories}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {/* "All" leaves the archive out; "Archived" shows it. */}
              <div className="seg" role="group" aria-label={m.field.status}>
                <button aria-pressed={status === ''} onClick={() => setStatus('')}>
                  {m.common.all}
                </button>
                {PROJECT_STATUSES.map((s) => (
                  <button key={s} aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
                    {m.status[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="empty">{m.home.noResults}</div>
          ) : (
            <div className="cards">
              {visible.map(({ p, items, hits }) => (
                <ProjectCard key={p.id} project={p} items={items} hits={hits} onEdit={() => setDialog({ project: p })} />
              ))}
            </div>
          )}
        </>
      )}

      <ProjectDialog
        open={!!dialog}
        project={dialog?.project ?? null}
        categories={categories}
        onClose={() => setDialog(null)}
        onCreated={(id) => navigate(`/p/${id}`)}
      />
    </main>
  )
}

function pickOf(project: Project, items: Product[], meId: string) {
  const decision = project.decisionProductId ? items.find((i) => i.id === project.decisionProductId) : undefined
  const favorite = items.filter((i) => isFavorite(i, meId)).sort((a, b) => (a.favoriteRank ?? 999) - (b.favoriteRank ?? 999))[0]
  return { decision, favorite }
}

function ProjectCard({ project, items, hits, onEdit }: { project: Project; items: Product[]; hits: number; onEdit: () => void }) {
  const { m, fmt } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const me = useMe()
  const { decision, favorite } = pickOf(project, items, me.id)
  const image = productImage(decision) || productImage(favorite) || items.map(productImage).find(Boolean)
  const pick = decision ?? favorite
  const archived = project.status === 'archived'
  const returns = openReturns(items)
  // Found in the last days and still in the running: one tap opens the table filtered to them.
  const fresh = items.filter((p) => p.candidate !== 'excluded' && isNew(p.createdAt)).length

  return (
    <article className={`card${archived ? ' archived' : ''}`}>
      <div className="card-media">
        {image ? (
          <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="monogram" aria-hidden="true">
            {project.name.slice(0, 2)}
          </span>
        )}
        <span className="count-badge">
          {items.length}
          <small>{m.home.productCount(items.length).replace(/^\d+\s*/, '')}</small>
        </span>
      </div>
      <div className="card-body">
        <Link to={`/p/${project.id}`} className="card-title">
          {project.name}
        </Link>
        <div className="row" style={{ gap: 10 }}>
          <Stage status={project.status} />
          {project.category && <span className="card-meta">· {project.category}</span>}
        </div>
        {hits > 0 && <span className="card-hits">{m.home.matchesIn(hits)}</span>}
        {fresh > 0 && (
          <Link className="card-new" to={`/p/${project.id}?chips=new`}>
            {m.home.newCount(fresh)}
          </Link>
        )}
        {returns.length > 0 && (
          <span className="card-return">
            <span className="warn-dot" aria-hidden="true" />
            {m.home.returnUntil(fmt.date(returns[0].until))}
          </span>
        )}
        <div className="card-pick">
          {pick ? (
            <>
              <span className={`label${decision && project.status === 'purchased' ? ' purchased' : ''}`}>
                {decision ? (project.status === 'purchased' ? m.status.purchased : m.home.chosen) : m.home.favorite}
              </span>
              <b title={productName(pick, m.product.unnamed)}>{productName(pick, m.product.unnamed)}</b>
            </>
          ) : (
            <span className="muted">{m.project.noDecision}</span>
          )}
          <span className="spacer" />
          <span className="muted small" title={fmt.dateTime(project.updatedAt)} style={{ whiteSpace: 'nowrap' }}>
            {fmt.relative(project.updatedAt)}
          </span>
        </div>
      </div>
      <div className="card-menu">
        {/* Floating: the card clips what leaves it (its picture has round corners). */}
        <Menu label={`${m.common.actions}: ${project.name}`} trigger={<Glyph name="more" />} floating>
          {(close) => (
            <>
              <button onClick={() => navigate(`/p/${project.id}`)}>{m.common.open}</button>
              <button
                onClick={() => {
                  close()
                  onEdit()
                }}
              >
                <Glyph name="edit" /> {m.common.edit}
              </button>
              <button
                onClick={async () => {
                  close()
                  const name = await uniqueProjectName(`${project.name} (${m.common.copySuffix})`)
                  await duplicateProject(project.id, name)
                  toast(name)
                }}
              >
                <Glyph name="copy" /> {m.common.duplicate}
              </button>
              <button
                onClick={async () => {
                  close()
                  await updateProject(project.id, { status: archived ? (project.decisionProductId ? 'decided' : 'comparing') : 'archived' })
                }}
              >
                <Glyph name="archive" /> {archived ? m.common.unarchive : m.common.archive}
              </button>
              <ExportChoice close={close} run={(f) => void exportComparison(project.id, f, m)} />
              <hr />
              <button
                className="danger"
                onClick={async () => {
                  close()
                  const ok = await confirm({ title: m.home.deleteTitle(project.name), text: m.home.deleteText, confirmLabel: m.common.delete, danger: true })
                  if (ok) await deleteProject(project.id)
                }}
              >
                <Glyph name="trash" /> {m.common.delete}
              </button>
            </>
          )}
        </Menu>
      </div>
    </article>
  )
}

export function ProjectDialog({
  open,
  project,
  categories,
  onClose,
  onCreated,
}: {
  open: boolean
  project: Project | null
  categories: string[]
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  const { m } = useI18n()
  return (
    <Modal open={open} onClose={onClose} labelledBy="project-dialog-title">
      <ProjectForm key={project?.id ?? 'new'} project={project} categories={categories} onClose={onClose} onCreated={onCreated} m={m} />
    </Modal>
  )
}

function ProjectForm({
  project,
  categories,
  onClose,
  onCreated,
  m,
}: {
  project: Project | null
  categories: string[]
  onClose: () => void
  onCreated?: (id: string) => void
  m: ReturnType<typeof useI18n>['m']
}) {
  const [name, setName] = useState(project?.name ?? '')
  const [category, setCategory] = useState(project?.category ?? '')
  return (
    <form
      className="dialog"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        if (project) {
          await updateProject(project.id, { name: name.trim(), category: category.trim() })
          onClose()
        } else {
          const created = await createProject({ name: name.trim(), category: category.trim() })
          onClose()
          onCreated?.(created.id)
        }
      }}
    >
      <h2 id="project-dialog-title">{project ? m.home.renameTitle : m.home.newTitle}</h2>
      <Field label={m.field.name}>
        <input className="input" autoFocus required value={name} placeholder={m.home.namePlaceholder} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={m.field.category}>
        <input className="input" list="category-list" value={category} placeholder={m.home.categoryPlaceholder} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="category-list">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          {m.common.cancel}
        </button>
        <button type="submit" className="btn primary">
          {project ? m.common.save : m.home.create}
        </button>
      </div>
    </form>
  )
}
