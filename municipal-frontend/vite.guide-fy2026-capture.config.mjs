import baseConfig from './vite.config.js'

// Local guide capture server whose paired API process writes its temporary
// development mail output to a private local file for the masked OTP step.
export default {
  ...baseConfig,
  server: {
    ...baseConfig.server,
    port: 5178,
    strictPort: true,
    proxy: {
      ...baseConfig.server.proxy,
      '/api': {
        ...baseConfig.server.proxy['/api'],
        target: 'http://127.0.0.1:3005',
      },
    },
  },
}
