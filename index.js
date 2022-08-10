import fastify from "fastify";
import fastifyHttpProxy from "@fastify/http-proxy";
import { deepEqual as assertEqual } from "assert/strict";
import { fastifyRequestContextPlugin } from "@fastify/request-context";
import { setTimeout } from "timers/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import throat from "throat";

const store = new AsyncLocalStorage();

// The target of the Proxy
const targetInstance = fastify();
targetInstance.get("/", () => setTimeout(300).then(() => "It works!"));
targetInstance.get("/404", (_req, reply) =>
  setTimeout(1200).then(() => {
    reply.status(404).send("It 404!");
  })
);
const targetBaseUrl = await targetInstance.listen();

// The app that should be causing the problem, and has
// a regular endpoint and a proxy endpoint to the target app above.
const instance = fastify();
// instance.register(fastifyRequestContextPlugin);
instance.addHook("onRequest", (req, reply, next) => {
  store.run(new Map(), () => next());
});

instance.register(fastifyHttpProxy, {
  prefix: "/api",
  upstream: targetBaseUrl,
  target: "http://localhost:3001",
});
instance.post("/result", async (req) => {
  const { time, result } = req.query;

  let requestContext = store.getStore();
  requestContext.set("time", parseInt(time));
  requestContext.set("result", result);

  await waitAndResult(req);

  requestContext = store.getStore();

  return requestContext.get("finalResult");
});

async function waitAndResult(req) {
  const requestContext = store.getStore();

  await setTimeout(requestContext.get("time"));

  const result = requestContext.get("result");

  await 1;

  requestContext.set("finalResult", result + "!");

  await 1;
}

const baseUrl = await instance.listen();


// Just make sure that the apps work
assertEqual(await fetch(targetBaseUrl).then((x) => x.text()), "It works!");
assertEqual(
  await fetch(new URL("/api", baseUrl)).then((x) => x.text()),
  "It works!"
);
assertEqual(
  await fetch(new URL("/result?time=100&result=hello", baseUrl), {method: 'POST'}).then((x) =>
    x.text()
  ),
  "hello!"
);

// Now let's try and reproduce
await Promise.all(
  Array(10000)
    .fill(0)
    .map(
      throat(100, async (_, i) => {
        const time = (Math.random() * 2000) | (0 + 100);
        const result = (Math.random() * 1000) | 0;

        const fetchResult = await fetch(
          new URL(`/result?time=${time}&result=${result}`, baseUrl),
          {
            method: "POST",
            body: "assssssassssssassssssassssssassssssassssssassssssassssssassssss",
          }
        ).then((x) => x.text());

        assertEqual(
          fetchResult,
          result.toString() + "!",
          `${i} - ${time} - ${result} != ${fetchResult}`
        );
        assertEqual(
          (
            await Promise.all([
              fetch(new URL("/api/", baseUrl)).then((x) => x.text()),
              fetch(new URL(`/api/404`, baseUrl)).then((x) => x.text()),
            ])
          ).join(","),
          "It works!,It 404!",
        );
        process.stdout.write(".");
      })
    )
);

for (const i of Array(1000).fill(0)) {
}

await targetInstance.close();
await instance.close();
