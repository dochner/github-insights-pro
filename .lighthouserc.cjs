// Assertions are mostly `warn` on this first CI pass since `/` hits the live GitHub API, adding network variance outside the app's control.
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/'],
      // Build runs separately via the `lighthouse` npm script, so this only needs to cover server boot.
      startServerCommand: 'pnpm preview',
      startServerReadyPattern: 'Listening on',
      startServerReadyTimeout: 30000,
      numberOfRuns: 3,
    },
    assert: {
      // No preset: `lighthouse:recommended` silently forces many per-audit assertions to `error`, beyond the warn-heavy set below.
      assertions: {
        // Live GitHub API calls during load make this noisy, so only warn.
        'categories:performance': ['warn', { minScore: 0.5 }],
        // No dedicated accessibility/SEO audit pass has happened yet.
        'categories:accessibility': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],
        // Kept as a hard error: a stock Nuxt app should pass this regardless of network conditions.
        'categories:best-practices': ['error', { minScore: 0.9 }],
        // Downgrade the noisiest/network-bound preset audits from error to warn for now.
        'uses-http2': 'warn',
        'uses-long-cache-ttl': 'warn',
        'unused-javascript': 'warn',
        'render-blocking-resources': 'warn',
        'third-party-summary': 'warn',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
