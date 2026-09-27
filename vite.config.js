import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so Hostinger connector vars (SUPABASE_*) are visible alongside VITE_*.
  const env = loadEnv(mode, process.cwd(), '')

  const supabaseUrl =
    env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  const supabaseKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_API_KEY ||
    ''

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // Expose canonical VITE_* names to the client even when only Hostinger
    // connector names (SUPABASE_URL / SUPABASE_API_KEY) are set at build time.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
    },
  }
})
