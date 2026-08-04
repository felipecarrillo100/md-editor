import { createTheme, type Theme } from '@mui/material/styles'

/** The one shared accent color — also mirrored onto --rdd-accent-color in App.tsx so the MUI
 * navbar and the workspace chrome read as one cohesive brand rather than two stacked UI kits. */
export const ACCENT_COLOR = '#38bdf8'

export function createAppTheme(mode: 'light' | 'dark'): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: ACCENT_COLOR },
    },
    typography: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    },
    shape: { borderRadius: 6 },
  })
}
