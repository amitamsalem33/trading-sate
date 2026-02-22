python3 << 'PYEOF'
content = """import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        }
      }
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || '')
    }
  }
})
"""
with open('/Users/amitamsalam/Desktop/trading-platform/frontend/vite.config.js', 'w') as f:
    f.write(content)
print("vite.config.js fixed!")
PYEOF
