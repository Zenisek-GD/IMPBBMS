import baseConfig from './vite.config.js'

// Local-only guide capture against the corrected, isolated training database.
export default {
  ...baseConfig,
  server: {
    ...baseConfig.server,
    port: 5176,
    strictPort: true,
    proxy: {
      ...baseConfig.server.proxy,
      '/api': {
        ...baseConfig.server.proxy['/api'],
        target: 'http://127.0.0.1:3003',
      },
    },
  },
}
