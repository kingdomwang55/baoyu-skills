import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startServer } from "../apps/baoyu-worker/src/server.ts";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.on("listening", () => resolve(server.address()));
  });
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text}`);
  }
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} returned HTTP ${response.status}, expected ${expected}`);
  }
}

const dataDir = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-smoke-"));
const server = startServer({
  host: "127.0.0.1",
  port: 0,
  dataDir,
  token: "smoke-token",
  autoRun: false,
});

try {
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: "Bearer smoke-token" };

  const health = await fetch(`${baseUrl}/health`, { headers });
  assertStatus(health, 200, "GET /health");

  const skillsResponse = await fetch(`${baseUrl}/v1/skills`, { headers });
  assertStatus(skillsResponse, 200, "GET /v1/skills");
  const skills = await readJson(skillsResponse);
  if (!Array.isArray(skills.skills) || !skills.skills.some((skill) => skill.id === "baoyu-url-to-markdown")) {
    throw new Error("GET /v1/skills did not include baoyu-url-to-markdown");
  }

  const jobResponse = await fetch(`${baseUrl}/v1/jobs`, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      skill: "baoyu-cover-image",
      input: { title: "Smoke test" },
    }),
  });
  assertStatus(jobResponse, 202, "POST /v1/jobs");
  const job = await readJson(jobResponse);
  if (job.status !== "queued" || job.operation !== "instruction") {
    throw new Error(`Unexpected job response: ${JSON.stringify(job)}`);
  }

  console.log(JSON.stringify({
    status: "ok",
    baseUrl,
    skills: skills.skills.length,
    jobId: job.id,
  }));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
