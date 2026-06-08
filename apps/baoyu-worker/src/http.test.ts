import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createWorkerApp } from "./server";

async function request(app: ReturnType<typeof createWorkerApp>, init: {
  method: string;
  path: string;
  token?: string;
  body?: unknown;
}) {
  return app.handle({
    method: init.method,
    url: init.path,
    headers: init.token ? { authorization: `Bearer ${init.token}` } : {},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("baoyu-worker http api", () => {
  it("requires bearer auth when a token is configured", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const response = await request(app, { method: "GET", path: "/v1/skills" });

      assert.equal(response.status, 401);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates queued jobs through the JSON API", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const response = await request(app, {
        method: "POST",
        path: "/v1/jobs",
        token: "secret",
        body: {
          skill: "baoyu-cover-image",
          input: { title: "Launch" },
        },
      });

      assert.equal(response.status, 202);
      assert.match(response.body.id, /^job_/);
      assert.equal(response.body.status, "queued");
      assert.equal(response.body.skill, "baoyu-cover-image");
      assert.equal(response.body.operation, "instruction");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unknown skills before creating a job", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const response = await request(app, {
        method: "POST",
        path: "/v1/jobs",
        token: "secret",
        body: {
          skill: "baoyu-nope",
          input: {},
        },
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /Unknown skill/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("downloads job files as binary-safe buffers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const created = await request(app, {
        method: "POST",
        path: "/v1/jobs",
        token: "secret",
        body: {
          skill: "baoyu-cover-image",
          input: { title: "Launch" },
        },
      });
      const file = path.join(root, "jobs", created.body.id, "output", "image.png");
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
      await writeFile(file, bytes);

      const response = await request(app, {
        method: "GET",
        path: `/v1/jobs/${created.body.id}/files/image.png`,
        token: "secret",
      });

      assert.equal(response.status, 200);
      assert.equal(Buffer.isBuffer(response.body), true);
      assert.deepEqual(response.body, bytes);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
