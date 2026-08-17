import { Server } from 'net'

/**
 * Bind `server` to the first port (starting from `port`) that is not
 * already in use, walking the port number with `nextPort` after each
 * `EADDRINUSE`. Returns the port that finally listened.
 *
 * Used by the multiplayer preload to host its HTTP file proxy and the
 * per-peer LAN bridge servers without colliding with other launcher
 * instances or the user's own services.
 */
export async function listen(server: Server, port: number, nextPort: (cur: number) => number) {
  for (; port <= 65535; port = nextPort(port)) {
    const listened = await new Promise<boolean>((resolve, reject) => {
      const handleError = (e: any) => {
        if (e.code === 'EADDRINUSE') {
          resolve(false)
        } else {
          reject(e)
        }
      }
      server.addListener('error', handleError)
      server.listen(port, () => {
        server.removeListener('error', handleError)
        resolve(true)
      })
    })

    if (listened) {
      break
    }
  }
  return port
}
