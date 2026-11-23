import { GUIDE_URL, SOURCE_URL } from '../config'
import { useI18n } from '../i18n'

/** The user guide and the source code, one line – in Settings and on the start page. */
export function ProjectLinks() {
  const { m } = useI18n()
  return (
    <p className="project-links">
      <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer">
        {m.common.userGuide}
      </a>
      {' · '}
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
        {m.common.sourceCode}
      </a>
    </p>
  )
}
