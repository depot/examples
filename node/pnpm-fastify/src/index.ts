import Fastify from 'fastify'

/* Add a source code change */
const api = Fastify({
  logger: {
    level: 'info',
  },
})

api.get('/health', (_, reply) => {
  reply.send({alive: true})
})

const start = async () => {
  try {
    await api.listen({port: 3000, host: '0.0.0.0'})
  } catch (err) {
    api.log.error(err)
    process.exit(1)
  }
}
start()
