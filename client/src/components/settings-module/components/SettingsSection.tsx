import type { ReactNode } from 'react'

export function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="settings-section" aria-label={title}>
      <div className="settings-section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-group">{children}</div>
    </section>
  )
}
