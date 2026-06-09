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

  it("accepts WeChat API markdown jobs with inline base64 files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const response = await request(app, {
        method: "POST",
        path: "/v1/jobs",
        token: "secret",
        body: {
          skill: "baoyu-post-to-wechat",
          operation: "api",
          input: {
            markdown: "---\ntitle: 文章标题\ncover: imgs/cover.png\n---\n\n# 文章标题\n\n正文",
            files: {
              "imgs/cover.png": {
                encoding: "base64",
                contentType: "image/png",
                data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
              },
            },
            theme: "grace",
            dryRun: true,
          },
        },
      });

      assert.equal(response.status, 202);
      assert.equal(response.body.skill, "baoyu-post-to-wechat");
      assert.equal(response.body.operation, "api");
      assert.equal(response.body.status, "queued");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects WeChat API jobs without a file, markdown, html, or rawArgs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const app = createWorkerApp({ dataDir: root, token: "secret", autoRun: false });
      const response = await request(app, {
        method: "POST",
        path: "/v1/jobs",
        token: "secret",
        body: {
          skill: "baoyu-post-to-wechat",
          operation: "api",
          input: {
            title: "Missing body",
          },
        },
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /input.markdown, input.html, input.file, or input.rawArgs/);
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
