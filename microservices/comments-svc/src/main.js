import path from 'path'
import glob from 'glob'
import Mali from 'mali'
import Redis from 'ioredis'
import Aigle from 'aigle'

import errorMiddleware from '@malijs/onerror'
import loggerMiddleware from '@malijs/logger'

import { service } from 'grpc-health-check'

import Db from './db'
import logger from './logger'
import { grpcConfig, cacheConfig } from './config'

import CacheService from './services/cache.service'
import CacheMiddleware from './middlewares/cache.middleware'
import HealthCheckService from './services/health-check.service'
import CommentRepository from './repositories/comment.repository'

const MODEL_NAME = 'Comment'
const SERVICE_NAME = 'CommentsService'

const SERVICE_PROTO = path.resolve(__dirname, '_proto/comment.proto')

const HOST_PORT = `${grpcConfig.host}:${grpcConfig.port}`

const { map } = Aigle

const main = async () => {
  const modelPaths = glob.sync(path.resolve(__dirname, '../**/*.model.js'))
  const db = await Db.init(modelPaths, logger)
  const repo = new CommentRepository(db.model(MODEL_NAME))

  const redisHostConfig = `${cacheConfig.host || ''}`.split(',')

  let cache

  if (redisHostConfig.length > 1) {
    const redisNodes = await map(redisHostConfig, (host) => ({
      host,
      port: cacheConfig.port
    }))

    cache = new Redis.Cluster(redisNodes, {
      slotsRefreshTimeout: 20000,
      redisOptions: {
        password: cacheConfig.password
      }
    })
  } else {
    cache = new Redis(cacheConfig)
  }

  const cacheService = new CacheService(cache, logger)
  const cacheMiddleware = new CacheMiddleware(cacheService, logger)

  const CommentsService = {
    find: [cacheMiddleware.find('comments'), repo.find.bind(repo)],
    findById: [cacheMiddleware.read('comments'), repo.findById.bind(repo)],
    findOne: [cacheMiddleware.read('comments'), repo.findOne.bind(repo)],
    count: repo.count.bind(repo),
    create: [cacheMiddleware.write('comments'), repo.create.bind(repo)],
    update: [cacheMiddleware.write('comments'), repo.update.bind(repo)],
    destroy: [cacheMiddleware.remove('comments'), repo.destroy.bind(repo)]
  }

  const server = new Mali()
  const healthCheckService = new HealthCheckService(SERVICE_NAME)
  const healthCheckImpl = await healthCheckService.getServiceImpl()

  server.addService(SERVICE_PROTO, null, {
    keepCase: true,
    enums: String,
    oneofs: true
  })
  server.addService(service)

  server.use(
    errorMiddleware((err, ctx) => {
      logger.error(`${ctx.service}#${ctx.name}.error %o`, err)
      throw err
    })
  )
  server.use(
    loggerMiddleware({
      timestamp: true,
      request: true,
      response: true
    })
  )
  server.use({
    CommentsService,
    ...healthCheckImpl
  })

  await server.start(HOST_PORT)

  logger.info(`gRPC Server is now listening on port ${grpcConfig.port}`)

  return {
    server,
    cache,
    db
  }
}

export default main
