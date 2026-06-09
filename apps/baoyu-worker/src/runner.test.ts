import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { JobRecord } from "./types";
import { createRunner } from "./runner";

function createMemoryStore(job: JobRecord) {
  return {
    async get(id: string): Promise<JobRecord | undefined> {
      return id === job.id ? job : undefined;
    },
    async create(): Promise<JobRecord> {
      return job;
    },
    async update(id: string, patch: Partial<JobRecord>): Promise<JobRecord | undefined> {
      if (id !== job.id) return undefined;
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      return job;
    },
    resolveJobFile(): string {
      throw new Error("not used");
    },
  };
}

describe("baoyu-worker runner", () => {
  it("materializes markdown, html, text, string files, and base64 files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-runner-"));
    const job: JobRecord = {
      id: "job_materialize",
      skill: "baoyu-unknown",
      operation: "default",
      status: "queued",
      dir: root,
      outputDir: path.join(root, "output"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: [],
    };

    try {
      const runner = createRunner({
        repoRoot: process.cwd(),
        store: createMemoryStore(job),
      });

      await runner.run(job, {
        skill: "baoyu-unknown",
        input: {
          markdown: "# Markdown",
          html: "<html><body>HTML</body></html>",
          text: "Plain text",
          files: {
            "notes/extra.md": "Extra markdown",
            "imgs/cover.png": {
              encoding: "base64",
              contentType: "image/png",
              data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
            },
          },
        },
      });

      assert.equal(await readFile(path.join(root, "input.md"), "utf8"), "# Markdown");
      assert.equal(await readFile(path.join(root, "input.html"), "utf8"), "<html><body>HTML</body></html>");
      assert.equal(await readFile(path.join(root, "input.txt"), "utf8"), "Plain text");
      assert.equal(await readFile(path.join(root, "notes", "extra.md"), "utf8"), "Extra markdown");
      assert.deepEqual(await readFile(path.join(root, "imgs", "cover.png")), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      assert.equal(job.status, "failed");
      assert.match(job.error ?? "", /Unknown skill/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects base64 files that escape the job directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-runner-"));
    const job: JobRecord = {
      id: "job_escape",
      skill: "baoyu-unknown",
      operation: "default",
      status: "queued",
      dir: root,
      outputDir: path.join(root, "output"),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: [],
    };

    try {
      const runner = createRunner({
        repoRoot: process.cwd(),
        store: createMemoryStore(job),
      });

      await runner.run(job, {
        skill: "baoyu-unknown",
        input: {
          files: {
            "../cover.png": {
              encoding: "base64",
              data: Buffer.from("bad").toString("base64"),
            },
          },
        },
      });

      assert.equal(job.status, "failed");
      assert.match(job.error ?? "", /escapes the job directory/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
