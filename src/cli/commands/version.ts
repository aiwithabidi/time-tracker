import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { define } from 'gunshi'
import { VERSION } from '../version'
import { output, errorOutput } from '../format'

const versionCommand = define({
  name: 'version',
  description: 'Show tt version and update status',
  args: {},
  run: () => {
    output('info', `tt v${VERSION}`)

    // Check for cached update status
    const cacheFile = path.join(os.homedir(), '.tt', 'cache', 'update-check.json')
    if (fs.existsSync(cacheFile)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
        if (cache.update_available) {
          output('info', `Update available: v${cache.installed} → v${cache.latest}`)
          output('info', 'Run "tt update" to install the latest version')
        } else {
          output('info', 'You are on the latest version')
        }
      } catch {
        // Cache file unreadable, skip
      }
    }
  },
})

export default versionCommand
