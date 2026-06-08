import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { createJobStore } from "./jobs";
import { buildInvocation, getSkill, listSkills } from "./registry";
import { createRunner } from "./runner";
import type { JobRequest } from "./types";

interface IncomingRequest {
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}

interface JsonResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
}

interface WorkerOptions {
  dataDir: string;
  repoRoot?: string;
  token?: string;
  autoRun?: boolean;
}

function json(status: number, body: any): JsonResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function unauthorized(): JsonResponse {
  return json(401, { error: "unauthorized" });
}

function readAuth(headers: IncomingRequest["headers"]): string | undefined {
  const value = headers?.authorization;
  return Array.isArray(value) ? value[0] : value;
}

function parseJsonBody(body: string | undefined): any {
  if (!body) {
    return {};
  }
  return JSON.parse(body);
}

function validJobRequest(value: any): value is JobRequest {
  return value && typeof value === "object" && typeof value.skill === "string";
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".md" || ext === ".txt" || ext === ".log") return "text/plain; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

export function createWorkerApp(options: WorkerOptions) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const store = createJobStore({ dataDir: options.dataDir });
  const runner = createRunner({ repoRoot, store, env: process.env });
  const autoRun = options.autoRun ?? true;

  async function handle(request: IncomingRequest): Promise<JsonResponse> {
    if (options.token && readAuth(request.headers) !== `Bearer ${options.token}`) {
      return unauthorized();
    }

    const url = new URL(request.url, "http://baoyu-worker.local");

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { status: "ok" });
    }

    if (request.method === "GET" && url.pathname === "/v1/skills") {
      return json(200, { skills: listSkills() });
    }

    if (request.method === "POST" && url.pathname === "/v1/jobs") {
      const payload = parseJsonBody(request.body);
      if (!validJobRequest(payload)) {
        return json(400, { error: "Request body must include a string skill field" });
      }
      const skill = getSkill(payload.skill);
      if (!skill) {
        return json(400, { error: `Unknown skill: ${payload.skill}` });
      }
      const operation = payload.operation ?? skill.defaultOperation;
      try {
        buildInvocation({
          skill: payload.skill,
          operation,
          input: payload.input,
          workDir: path.join(options.dataDir, "validation"),
          repoRoot,
        });
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : String(error) });
      }
      const jobRequest = { ...payload, operation };
      const job = await store.create(jobRequest);
      if (autoRun) {
        void runner.run(job, jobRequest);
      }
      return json(202, job);
    }

    const jobMatch = /^\/v1\/jobs\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && jobMatch) {
      const job = await store.get(jobMatch[1]);
      if (!job) {
        return json(404, { error: "job not found" });
      }
      return json(200, job);
    }

    const fileMatch = /^\/v1\/jobs\/([^/]+)\/files\/(.+)$/.exec(url.pathname);
    if (request.method === "GET" && fileMatch) {
      const job = await store.get(fileMatch[1]);
      if (!job) {
        return json(404, { error: "job not found" });
      }
      try {
        const filePath = store.resolveJobFile(job, decodeURIComponent(fileMatch[2]));
        const body = await fs.readFile(filePath);
        return {
          status: 200,
          headers: { "content-type": contentTypeFor(filePath) },
          body,
        };
      } catch (error) {
        return json(404, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    return json(404, { error: "not found" });
  }

  return { handle };
}

export function startServer(options: WorkerOptions & { port: number; host: string }) {
  const app = createWorkerApp(options);
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      try {
        const response = await app.handle({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers: req.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        res.writeHead(response.status, response.headers);
        if (Buffer.isBuffer(response.body)) {
          res.end(response.body);
        } else {
          res.end(typeof response.body === "string" ? response.body : JSON.stringify(response.body));
        }
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    });
  });
  server.listen(options.port, options.host);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "8787");
  const host = process.env.HOST ?? "0.0.0.0";
  const dataDir = process.env.BAOYU_WORKER_DATA_DIR ?? path.resolve("worker-data");
  const token = process.env.BAOYU_WORKER_TOKEN;
  startServer({ port, host, dataDir, token });
  console.log(`baoyu-worker listening on http://${host}:${port}`);
}
