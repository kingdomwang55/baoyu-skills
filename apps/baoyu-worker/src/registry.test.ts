import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInvocation, listSkills } from "./registry";

describe("baoyu-worker registry", () => {
  it("registers every marketplace skill", () => {
    const ids = listSkills().map((skill) => skill.id).sort();

    assert.deepEqual(ids, [
      "baoyu-article-illustrator",
      "baoyu-comic",
      "baoyu-compress-image",
      "baoyu-cover-image",
      "baoyu-danger-gemini-web",
      "baoyu-danger-x-to-markdown",
      "baoyu-diagram",
      "baoyu-electron-extract",
      "baoyu-format-markdown",
      "baoyu-image-gen",
      "baoyu-infographic",
      "baoyu-markdown-to-html",
      "baoyu-post-to-wechat",
      "baoyu-post-to-weibo",
      "baoyu-post-to-x",
      "baoyu-slide-deck",
      "baoyu-translate",
      "baoyu-url-to-markdown",
      "baoyu-wechat-summary",
      "baoyu-xhs-images",
      "baoyu-youtube-transcript",
    ]);
  });

  it("builds array-form command arguments for a CLI skill", () => {
    const invocation = buildInvocation({
      skill: "baoyu-url-to-markdown",
      input: {
        url: "https://example.com/article",
        format: "markdown",
        downloadMedia: true,
        headless: true,
      },
      workDir: "/data/jobs/job_123",
    });

    assert.equal(invocation.kind, "cli");
    assert.equal(invocation.command, "bun");
    assert.deepEqual(invocation.args, [
      "skills/baoyu-url-to-markdown/scripts/lib/cli.ts",
      "https://example.com/article",
      "--output",
      "/data/jobs/job_123/output/article.md",
      "--format",
      "markdown",
      "--download-media",
      "--headless",
    ]);
  });

  it("exposes instruction-only skills as prompt packages instead of shell commands", () => {
    const invocation = buildInvocation({
      skill: "baoyu-cover-image",
      input: { title: "Worker launch", brief: "Create a cover image" },
      workDir: "/data/jobs/job_456",
    });

    assert.equal(invocation.kind, "instruction");
    assert.equal(invocation.skillPath, "skills/baoyu-cover-image/SKILL.md");
    assert.equal(invocation.inputPath, "/data/jobs/job_456/input.json");
  });

  it("rejects unknown skills", () => {
    assert.throws(
      () => buildInvocation({
        skill: "baoyu-unknown",
        input: {},
        workDir: "/data/jobs/job_789",
      }),
      /Unknown skill/,
    );
  });
});
