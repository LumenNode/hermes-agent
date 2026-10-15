// LIVE PROBE for #138754 / #138961 — never committed. Drives Desktop's real Electron-side
// gateway attach code (ensure → ticket mint → native HTTP) against a REAL `hermes gateway`.
import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { ensureLocalGateway, nativeGatewayHttpHeaders, redialLocalGateway, runGatewayEnsure } from './local-gateway'

const HOME = process.env.PROBE_HOME || ''
const HERMES = process.env.PROBE_HERMES || ''
const OUT = process.env.PROBE_OUT || ''
const ROUTES = (process.env.PROBE_ROUTES || '/api/profiles').split(',')

test.skipIf(!HOME || !HERMES)('live: Desktop attaches to a real gateway and calls its API', { timeout: 240_000 }, async () => {
  const backend = { command: HERMES, args: (process.env.PROBE_ARGS_PREFIX ? process.env.PROBE_ARGS_PREFIX.split(' ') : []).concat(['gateway', 'ensure', '--json']), shell: false }
  const ensure = () => ensureLocalGateway(() => runGatewayEnsure(backend, process.cwd(), HOME))
  const results: Record<string, unknown>[] = []
  let ensures = 0

  for (const route of ROUTES) {
    const url = (base: string) => `${base}${route}`
    const row: Record<string, unknown> = { route }

    try {
      const outcome = await redialLocalGateway({
        ensure: async () => { ensures += 1; return ensure() },
        forget: () => {},
        use: async descriptor => {
          row.advertised_profile_id = descriptor.gatewayEndpoint.profile_id
          const headers = await nativeGatewayHttpHeaders(descriptor, url(descriptor.baseUrl), HOME)
          const response = await fetch(url(descriptor.baseUrl), { headers })
          const text = await response.text()

          return { status: response.status, body: text.slice(0, 300) }
        }
      })
      Object.assign(row, outcome)
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error)
    }

    results.push(row)
  }

  const line = JSON.stringify({ home: HOME, on_disk: fs.realpathSync.native(HOME), ensures, results })
  process.stderr.write(`RESULT ${line}\n`)
  if (OUT) {fs.writeFileSync(path.resolve(OUT), line + '\n')}
  expect(results.length).toBe(ROUTES.length)
})
