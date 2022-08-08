import fastify from 'fastify'
import fastifyHttpProxy from '@fastify/http-proxy'
import {deepEqual as assertEqual} from 'assert/strict'
import FastifyContext from '@fastify/request-context'

const targetInstance = fastify()
targetInstance.get('/', () => 'It works!')
const targetBaseUrl = await targetInstance.listen()


assertEqual(await fetch(targetBaseUrl).then(x => x.text()), 'It works!')

const instance = fastify()
instance.register(fastifyHttpProxy, {
  prefix: '/api',
  upstream: targetBaseUrl,
  target: 'http://localhost:3001',
})
const baseUrl = await instance.listen()

assertEqual(await fetch(new URL('/api', baseUrl)).then(x => x.text()), 'It works!')

await targetInstance.close()
await instance.close()