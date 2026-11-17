import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteProject, duplicateProject, uniqueProjectName, updateProject } from '../db/repo'
import type { ProjectStatus } from '../db/types'
import { productName } from '../domain/display'
import { exportProjectExcel, exportProjectJson } from '../hooks'
import { useI18n } from '../i18n'
import { useConfirm, useToast } from '../ui/Dialog'
import { Glyph } from '../ui/Glyph'
import { CommitInput } from '../ui/inputs'
import { Menu } from '../ui/Menu'
import { FieldsTab } from './project/FieldsTab'
import { NotesTab } from './project/NotesTab'
import { ProductDrawer } from './project/ProductDrawer'
import { ProductTable } from './project/ProductTable'
import { RequirementsTab } from './project/RequirementsTab'
import { useProjectData } from './project/useProjectData'
import { ShareDialog } from './project/ShareDialog'
import { QuickAdd } from './project/QuickAdd'
import { ProjectDialog } from './Home'
import { InTopbar } from '../ui/Topbar'
import { rolesOf } from '../sync'

const STAGES: ProjectStatus[] = ['research', 'comparing', 'decided', 'purchased', 'archived']
type Tab = 'products' | 'requirements' | 'fields' | 'notes'

export function ProjectPage() {
  const { id } = useParams()
  const data = useProjectData(id)
  const { m, fmt } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'products'
  const openProductId = params.get('product')
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [sharing, setSharing] = useState(false)
  const [editing, setEditing] = useState(false)
  const role = useLiveQuery(async () => (await rolesOf())[id ?? ''], [id])

  if (data === undefined) return <main aria-busy="true" />
  if (data === null)
    return (
      <main>
        <div className="empty">
          <p>{m.common.notFound}</p>
          <Link className="btn" to="/" style={{ marginTop: 12 }}>
            {m.common.back}
          </Link>
        </div>
      </main>
    )

  const { project, products } = data
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: key === 'product' ? false : true })
  }
  const decision = project.decisionProductId ? products.find((p) => p.id === project.decisionProductId) : undefined
  const stageIndex = STAGES.indexOf(project.status)

  return (
    <main className="wide project-page">
      <InTopbar>
        <div className="topbar-title">
          <span className="topbar-sep" aria-hidden="true">
            /
          </span>
          <h1 className="sr-only">{project.name}</h1>
          <CommitInput
            className="title-input"
            aria-label={m.field.name}
            value={project.name}
            size={Math.max(6, project.name.length + 1)}
            onCommit={(v) => v.trim() && updateProject(project.id, { name: v.trim() })}
          />
          <span className="topbar-dot" aria-hidden="true">
            ·
          </span>
          <CommitInput
            className="cat-input"
            aria-label={m.field.category}
            placeholder={m.field.category}
            value={project.category}
            size={Math.max(8, project.category.length + 1)}
            onCommit={(v) => updateProject(project.id, { category: v.trim() })}
          />
        </div>
        <div className="topbar-actions">
          {role === 'viewer' && <span className="role-badge">{m.share.readOnly}</span>}
          {products.length > 0 && role !== 'viewer' && (
            <Link className="btn sm primary" to={`/p/${project.id}/swipe`} title={m.swipe.openHint} aria-label={m.swipe.open}>
              <Glyph name="star" /> <span className="hide-narrow">{m.swipe.open}</span>
            </Link>
          )}
          {role === 'owner' && (
            <button type="button" className="btn sm" onClick={() => setSharing(true)} title={m.share.title} aria-label={m.share.title}>
              <Glyph name="share" /> <span className="hide-narrow">{m.share.title}</span>
            </button>
          )}
          <Menu label={m.common.more} trigger={<Glyph name="more" />}>
            {(close) => (
              <>
                <button
                  onClick={() => {
                    close()
                    setEditing(true)
                  }}
                >
                  <Glyph name="edit" /> {m.project.editDetails}
                </button>
                <button
                  onClick={() => {
                    close()
                    void exportProjectExcel(project.id, m)
                  }}
                >
                  <Glyph name="download" /> {m.common.exportExcel}
                </button>
                <button
                  onClick={() => {
                    close()
                    void exportProjectJson(project.id)
                  }}
                >
                  <Glyph name="download" /> {m.common.exportJson}
                </button>
                <hr />
                <button
                  onClick={async () => {
                    close()
                    const name = await uniqueProjectName(`${project.name} (${m.common.copySuffix})`)
                    const newId = await duplicateProject(project.id, name)
                    toast(name)
                    if (newId) navigate(`/p/${newId}`)
                  }}
                >
                  <Glyph name="copy" /> {m.common.duplicate}
                </button>
                <button
                  onClick={() => {
                    close()
                    void updateProject(project.id, { status: project.status === 'archived' ? 'comparing' : 'archived' })
                  }}
                >
                  <Glyph name="archive" /> {project.status === 'archived' ? m.common.unarchive : m.common.archive}
                </button>
                {role === 'owner' && <hr />}
                {role === 'owner' && (
                  <button
                    className="danger"
                    onClick={async () => {
                      close()
                      const ok = await confirm({
                        title: m.project.deleteTitle(project.name),
                        text: m.home.deleteText,
                        confirmLabel: m.common.delete,
                        danger: true,
                      })
                      if (ok) {
                        await deleteProject(project.id)
                        navigate('/')
                      }
                    }}
                  >
                    <Glyph name="trash" /> {m.common.delete}
                  </button>
                )}
              </>
            )}
          </Menu>
        </div>
      </InTopbar>

      {decision && (
        <div className={`decision-bar${decision.purchase.status === 'purchased' ? ' purchased' : ''}`}>
          <span className="label">{decision.purchase.status === 'purchased' ? m.purchase.purchased : m.project.decision}</span>
          <button className="btn ghost sm" style={{ fontWeight: 700, fontSize: 15 }} onClick={() => setParam('product', decision.id)}>
            {productName(decision, m.product.unnamed)}
          </button>
          {decision.purchase.status === 'purchased' && (
            <span className="muted small">
              {[
                decision.purchase.date && m.project.purchasedOn(fmt.date(decision.purchase.date)),
                decision.purchase.price !== null && fmt.money(decision.purchase.price),
                decision.purchase.retailer,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      )}

      <div className="tabbar">
        <div className="tabs" role="tablist">
          {(['products', 'requirements', 'fields', 'notes'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParam('tab', t === 'products' ? null : t)}>
              {m.project.tabs[t]}
              {t === 'products' && <span className="badge">{products.length}</span>}
              {t === 'requirements' && <span className="badge">{data.requirements.length}</span>}
              {t === 'fields' && <span className="badge">{data.properties.length}</span>}
            </button>
          ))}
        </div>
        <div className="tabbar-actions">
          <Menu
            label={`${m.project.stage}: ${m.status[project.status]}`}
            className="stage-trigger"
            trigger={
              <>
                <span className="stage-dot" data-status={project.status} aria-hidden="true" />
                <span>{m.status[project.status]}</span>
                <Glyph name="down" />
              </>
            }
          >
            {(close) =>
              STAGES.map((st, i) => (
                <button
                  key={st}
                  aria-pressed={project.status === st}
                  className={`stage-option${i < stageIndex && project.status !== 'archived' ? ' done' : ''}`}
                  onClick={() => {
                    close()
                    void updateProject(project.id, { status: st })
                  }}
                >
                  <span className="stage-dot" data-status={st} aria-hidden="true" />
                  {m.status[st]}
                  {project.status === st && <Glyph name="check" />}
                </button>
              ))
            }
          </Menu>
          {tab === 'products' && role !== 'viewer' && products.length > 0 && <QuickAdd data={data} onOpen={(pid) => setParam('product', pid)} />}
        </div>
      </div>

      <div role="tabpanel">
        {tab === 'products' && <ProductTable data={data} selection={selection} setSelection={setSelection} onOpen={(pid) => setParam('product', pid)} />}
        {tab === 'requirements' && <RequirementsTab data={data} onOpen={(pid) => setParam('product', pid)} />}
        {tab === 'fields' && <FieldsTab data={data} />}
        {tab === 'notes' && <NotesTab project={project} />}
      </div>

      <ProductDrawer data={data} productId={openProductId} onClose={() => setParam('product', null)} />
      <ShareDialog projectId={project.id} open={sharing} onClose={() => setSharing(false)} />
      <ProjectDialog open={editing} project={project} categories={[]} onClose={() => setEditing(false)} />
    </main>
  )
}
