import baseConfig from './vite.config.js'

// A second local-only guide server used while the original capture server is
// still running. It is pinned to the isolated FY 2026 training API.
export default {
  ...baseConfig,
  server: {
    ...baseConfig.server,
    port: 5177,
    strictPort: true,
    proxy: {
      ...baseConfig.server.proxy,
      '/api': {
        ...baseConfig.server.proxy['/api'],
        target: 'http://127.0.0.1:3004',
      },
    },
  },
}
