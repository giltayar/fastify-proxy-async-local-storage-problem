import fastify from "fastify";
import fastifyHttpProxy from "@fastify/http-proxy";
import { deepEqual as assertEqual } from "assert/strict";
import { fastifyRequestContextPlugin } from "@fastify/request-context";
import { setTimeout } from "timers/promises";
import throat from "throat";

const targetInstance = fastify();
targetInstance.get("/", () => setTimeout(1500).then(() => "It works!"));
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
  await 1

  req.requestContext.set("time", parseInt(time));
  req.requestContext.set("result", result);

  await waitAndResult(req);

  return req.requestContext.get('finalResult')
});

async function waitAndResult(req) {
  await setTimeout(req.requestContext.get("time"));

  const result = req.requestContext.get("result");

  await 1

  req.requestContext.set('finalResult', result + '!')

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
