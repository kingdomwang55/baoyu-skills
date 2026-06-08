import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createJobStore } from "./jobs";

describe("baoyu-worker jobs", () => {
  it("creates jobs under the configured data directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const store = createJobStore({ dataDir: root });
      const job = await store.create({
        skill: "baoyu-url-to-markdown",
        input: { url: "https://example.com" },
      });

      assert.match(job.id, /^job_/);
      assert.equal(job.status, "queued");
      assert.equal(job.dir.startsWith(path.join(root, "jobs")), true);
      assert.equal(job.outputDir, path.join(job.dir, "output"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prevents path traversal when resolving job files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baoyu-worker-"));
    try {
      const store = createJobStore({ dataDir: root });
      const job = await store.create({
        skill: "baoyu-url-to-markdown",
        input: { url: "https://example.com" },
      });

      assert.throws(() => store.resolveJobFile(job, "../secrets.txt"), /outside job output/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
