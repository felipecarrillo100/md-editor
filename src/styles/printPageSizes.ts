export type PageSizeKey = 'a4' | 'letter'

export const PAGE_SIZES: Record<PageSizeKey, { width: string; height: string }> = {
  a4: { width: '210mm', height: '297mm' },
  letter: { width: '8.5in', height: '11in' },
}

export const PRINT_MARGIN = '2cm'
