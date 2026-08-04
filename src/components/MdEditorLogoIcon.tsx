import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon'

/** The app's own mark — a bold "M" with a downward chevron, the same silhouette language as the
 * well-known, CC0 Markdown Mark. Same glyph as `public/favicon.svg` (minus its dark background
 * tile), so the brand icon here, the About dialog, and the browser tab all agree with each other.
 * Uses `currentColor` so it follows the usual `color`/`sx` props like any other MUI icon. */
export function MdEditorLogoIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 32 32">
      <path
        d="M6 22 L6 10 L11 17 L16 10 L16 22"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12 L25 18 L29 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  )
}
