import { updateProject } from '../../db/repo'
import type { Project } from '../../db/types'
import { useI18n } from '../../i18n'
import { CommitTextarea } from '../../ui/inputs'

export function NotesTab({ project }: { project: Project }) {
  const { m } = useI18n()
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 860 }}>
      <label className="field">
        <span>{m.project.descriptionLabel}</span>
        <CommitTextarea
          className="textarea"
          rows={3}
          value={project.description}
          placeholder={m.project.descriptionHint}
          onCommit={(v) => updateProject(project.id, { description: v })}
        />
      </label>
      <label className="field">
        <span>{m.project.notesLabel}</span>
        <CommitTextarea
          className="textarea"
          rows={16}
          value={project.notes}
          placeholder={m.project.notesHint}
          onCommit={(v) => updateProject(project.id, { notes: v })}
        />
      </label>
    </div>
  )
}
