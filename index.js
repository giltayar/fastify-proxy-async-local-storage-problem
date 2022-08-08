import fastify from "fastify";
import fastifyHttpProxy from "@fastify/http-proxy";
import { deepEqual as assertEqual } from "assert/strict";
import { fastifyRequestContextPlugin } from "@fastify/request-context";
import { setTimeout } from "timers/promises";
import {AsyncLocalStorage} from 'node:async_hooks'
import throat from "throat";

const store = new AsyncLocalStorage();

const targetInstance = fastify();
targetInstance.get("/", () => setTimeout(1500).then(() => "It works!"));
const targetBaseUrl = await targetInstance.listen();

const instance = fastify();
// instance.register(fastifyRequestContextPlugin);
instance.addHook('onRequest', (req, reply, next) => {
  store.run(new Map(), () => next())
})

instance.register(fastifyHttpProxy, {
  prefix: "/api",
  upstream: targetBaseUrl,
  target: "http://localhost:3001",
});
instance.get("/result", async (req) => {
  const { time, result } = req.query;

  let requestContext = store.getStore()
  requestContext.set("time", parseInt(time));
  requestContext.set("result", result);

  await waitAndResult(req);

  requestContext = store.getStore()

  return requestContext.get('finalResult')
});

async function waitAndResult(req) {
  const requestContext = store.getStore()

  await setTimeout(requestContext.get("time"));

  const result = requestContext.get("result");

  await 1

  requestContext.set('finalResult', result + '!')

  await 1
}

const baseUrl = await instance.listen();

assertEqual(await fetch(targetBaseUrl).then((x) => x.text()), "It works!");
assertEqual(
  await fetch(new URL("/api", baseUrl)).then((x) => x.text()),
  "It works!"
);
assertEqual(
  await fetch(new URL("/result?time=100&result=hello", baseUrl)).then((x) =>
    x.text()
  ),
  "hello!"
);

await Promise.all(
  Array(10000)
    .fill(0)
    .map(
      throat(100, async (_, i) => {
        const time = (Math.random() * 2000) | (0 + 100);
        const result = (Math.random() * 1000) | 0;

        const fetchResult = await fetch(
          new URL(`/result?time=${time}&result=${result}`, baseUrl)
        ).then((x) => x.text());

        assertEqual(
          fetchResult,
          result.toString() + '!',
          `${i} - ${time} - ${result} != ${fetchResult}`
        );
        assertEqual(
          await fetch(new URL("/api", baseUrl)).then((x) => x.text()),
          "It works!"
        );
        process.stdout.write(".");
      })
    )
);

for (const i of Array(1000).fill(0)) {
}

await targetInstance.close();
await instance.close();
