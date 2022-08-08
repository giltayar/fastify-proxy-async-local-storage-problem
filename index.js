import fastify from 'fastify'
import fastifyHttpProxy from '@fastify/http-proxy'
import {deepEqual as assertEqual} from 'assert/strict'
import {fastifyRequestContextPlugin} from '@fastify/request-context'
import {setTimeout} from 'timers/promises'

const targetInstance = fastify()
targetInstance.get('/', () => 'It works!')
const targetBaseUrl = await targetInstance.listen()


assertEqual(await fetch(targetBaseUrl).then(x => x.text()), 'It works!')

const instance = fastify()
instance.register(fastifyRequestContextPlugin)
instance.register(fastifyHttpProxy, {
  prefix: '/api',
  upstream: targetBaseUrl,
  target: 'http://localhost:3001',
})
instance.get('/result', async (req) => {
  const {time, result} = req.query

  req.requestContext.set('time', parseInt(time))
  req.requestContext.set('result', result)

  return await waitAndResult(req)
})
const baseUrl = await instance.listen()

assertEqual(await fetch(new URL('/api', baseUrl)).then(x => x.text()), 'It works!')
assertEqual(await fetch(new URL('/result?time=100&result=hello', baseUrl)).then(x => x.text()), 'hello')

await targetInstance.close()
await instance.close()


async function waitAndResult(req) {
  await setTimeout(req.requestContext.get('time'))

  return await req.requestContext.get('result')
}