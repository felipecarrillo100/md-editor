import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo under /<repo-name>/ — update if the repo is renamed.
const GITHUB_PAGES_BASE = '/md-editor/'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? GITHUB_PAGES_BASE : '/',
})
