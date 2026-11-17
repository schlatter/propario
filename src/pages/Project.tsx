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
    <main className="wide">
      <Link to="/" className="crumb">
        <Glyph name="chevronLeft" /> {m.nav.comparisons}
      </Link>
      <div className="project-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="sr-only">{project.name}</h1>
          <CommitInput
            className="title-input"
            aria-label={m.field.name}
            value={project.name}
            onCommit={(v) => v.trim() && updateProject(project.id, { name: v.trim() })}
          />
          <CommitInput
            className="cat-input"
            aria-label={m.field.category}
            placeholder={m.field.category}
            value={project.category}
            onCommit={(v) => updateProject(project.id, { category: v.trim() })}
          />
        </div>
        <div className="actions">
          {role === 'viewer' && <span className="role-badge">{m.share.readOnly}</span>}
          {products.length > 0 && role !== 'viewer' && (
            <Link className="btn sm primary" to={`/p/${project.id}/swipe`} title={m.swipe.openHint}>
              <Glyph name="star" /> {m.swipe.open}
            </Link>
          )}
          {role === 'owner' && (
            <button type="button" className="btn sm" onClick={() => setSharing(true)}>
              <Glyph name="share" /> {m.share.title}
            </button>
          )}
          <Menu
            label={m.project.exportMenu}
            trigger={
              <>
                <Glyph name="download" /> <span>{m.project.exportMenu}</span>
              </>
            }
            className="btn sm"
          >
            {(close) => (
              <>
                <button
                  onClick={() => {
                    close()
                    void exportProjectExcel(project.id, m)
                  }}
                >
                  {m.common.exportExcel}
                </button>
                <button
                  onClick={() => {
                    close()
                    void exportProjectJson(project.id)
                  }}
                >
                  {m.common.exportJson}
                </button>
              </>
            )}
          </Menu>
          <Menu label={m.common.more} trigger={<Glyph name="more" />}>
            {(close) => (
              <>
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
        <div className="stage-select" role="group" aria-label={m.project.stage} style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>
          {STAGES.map((s, i) => (
            <button
              key={s}
              aria-pressed={project.status === s}
              className={i < stageIndex && project.status !== 'archived' ? 'done' : ''}
              onClick={() => updateProject(project.id, { status: s })}
            >
              {m.status[s]}
            </button>
          ))}
        </div>
      </div>

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

      <div role="tabpanel">
        {tab === 'products' && <ProductTable data={data} selection={selection} setSelection={setSelection} onOpen={(pid) => setParam('product', pid)} />}
        {tab === 'requirements' && <RequirementsTab data={data} onOpen={(pid) => setParam('product', pid)} />}
        {tab === 'fields' && <FieldsTab data={data} />}
        {tab === 'notes' && <NotesTab project={project} />}
      </div>

      <ProductDrawer data={data} productId={openProductId} onClose={() => setParam('product', null)} />
      <ShareDialog projectId={project.id} open={sharing} onClose={() => setSharing(false)} />
    </main>
  )
}
