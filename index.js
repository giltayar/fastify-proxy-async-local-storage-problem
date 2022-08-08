import fastify from "fastify";
import fastifyHttpProxy from "@fastify/http-proxy";
import { deepEqual as assertEqual } from "assert/strict";
import { fastifyRequestContextPlugin } from "@fastify/request-context";
import { setTimeout } from "timers/promises";
import throat from 'throat'

const targetInstance = fastify();
targetInstance.get("/", () => "It works!");
const targetBaseUrl = await targetInstance.listen();

const instance = fastify();
instance.register(fastifyRequestContextPlugin);
instance.register(fastifyHttpProxy, {
  prefix: "/api",
  upstream: targetBaseUrl,
  target: "http://localhost:3001",
});
instance.get("/result", async (req) => {
  const { time, result } = req.query;

  req.requestContext.set("time", parseInt(time));
  req.requestContext.set("result", result);

  return await waitAndResult(req);
});

async function waitAndResult(req) {
  await setTimeout(req.requestContext.get("time"));

  return await req.requestContext.get("result");
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
  "hello"
);

await Promise.all(
  Array(1000)
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
          result.toString(),
          `${i} - ${time} - ${result} != ${fetchResult}`
        );
        process.stdout.write('.')
      })
    )
);

for (const i of Array(1000).fill(0)) {
}

await targetInstance.close();
await instance.close();
