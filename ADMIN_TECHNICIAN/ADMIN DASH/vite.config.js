import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

function syncTicketsPlugin() {
  const filePath = path.resolve(import.meta.dirname, '../shared_tickets.json')

  return {
    name: 'sync-tickets-plugin',
    configureServer(server) {
      server.middlewares.use('/api/sync-tickets', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(filePath)) {
              const data = fs.readFileSync(filePath, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify([]))
            }
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
          return
        }

        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body)
              let current = []
              if (fs.existsSync(filePath)) {
                try { current = JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch(e){}
              }

              const isSame = (a, b) => (a || '').toString().replace(/^#/, '').toLowerCase().trim() === (b || '').toString().replace(/^#/, '').toLowerCase().trim()
              const map = new Map()
              current.forEach(t => {
                const k = (t.id || t.ticketNumber || '').toString().replace(/^#/, '').toLowerCase().trim()
                if (k) map.set(k, t)
              })

              const list = Array.isArray(incoming) ? incoming : [incoming]
              list.forEach(t => {
                const k = (t.id || t.ticketNumber || '').toString().replace(/^#/, '').toLowerCase().trim()
                if (k) {
                  const old = map.get(k) || {}
                  map.set(k, { ...old, ...t })
                }
              })

              const merged = Array.from(map.values())
              fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, tickets: merged }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
          return
        }

        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    syncTicketsPlugin()
  ],
  server: {
    port: 5173,
    strictPort: true
  }
})
