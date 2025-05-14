// Parse command-line arguments and run the client
import { parseCommandLineArgs } from './lib/utils'
import { runClient } from './client'

parseCommandLineArgs(process.argv.slice(2), 3334, 'Usage: npx tsx client.ts <https://server-url> [callback-port]')
  .then(({ serverUrl, callbackPort, headers, transportStrategy, init }) => {
    return runClient(serverUrl, callbackPort, headers, transportStrategy, init)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
