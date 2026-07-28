// Vite dynamic-import chunk fetches can fail after a redeploy (stale cached index.html referencing hashes that no longer exist server-side), and during SSR hydration that bypasses defineAsyncComponent's onError entirely, so it's handled globally here instead; the sessionStorage flag is never auto-cleared — a timed re-arm was tried and dropped because a chunk request that fails slower than the timer re-arms the guard mid-flight and produces an unbounded reload loop on a flaky connection, which is worse than the stuck page it's meant to fix.
export default defineNuxtPlugin(() => {
  const RELOAD_FLAG = 'chunk-reload-attempted'

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()

    if (window.sessionStorage.getItem(RELOAD_FLAG)) return // already retried this session; don't loop

    window.sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
  })
})
