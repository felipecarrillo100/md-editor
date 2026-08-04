export interface HeadingInfo {
  level: number
  text: string
  id: string
}

export interface TocListProps {
  headings: HeadingInfo[]
  onSelect: (id: string) => void
}

/** Contributed to the app Sidebar's "Table of Contents" tab per-document — see
 * MarkdownDocumentPanel's usePanelContribution call. Clicking a heading scrolls the preview to
 * it; the editor follows automatically via the editor<->preview scroll-sync in scrollSync.ts. */
export function TocList({ headings, onSelect }: TocListProps) {
  if (headings.length === 0) {
    return (
      <div style={{ padding: '8px 6px', fontSize: '0.8rem', color: 'var(--rdd-text-secondary)' }}>
        No headings yet — start writing!
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px' }}>
      {headings.map((h, i) => (
        <button
          key={`${h.id}-${i}`}
          type="button"
          onClick={() => onSelect(h.id)}
          style={{
            textAlign: 'start',
            background: 'transparent',
            border: 'none',
            color: 'var(--rdd-panel-text)',
            padding: '4px 6px',
            paddingInlineStart: `${6 + (h.level - 1) * 14}px`,
            fontSize: h.level === 1 ? '0.85rem' : '0.8rem',
            opacity: h.level === 1 ? 1 : 0.85,
            cursor: 'pointer',
            borderRadius: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--rdd-panel-card-bg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {h.text}
        </button>
      ))}
    </div>
  )
}
