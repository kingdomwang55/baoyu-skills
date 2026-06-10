import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarkdownRenderInvocation,
  formatMarkdownRenderFailure,
} from "./wechat-api.ts";

test("wechat-api renders markdown by invoking bun directly", () => {
  const invocation = buildMarkdownRenderInvocation(
    "/app/skills/baoyu-post-to-wechat/scripts/md-to-wechat.ts",
    "/data/jobs/job_1/input.md",
    {
      title: "标题",
      theme: "grace",
      color: "blue",
      citeStatus: false,
    },
  );

  assert.notEqual(invocation.command, "npx");
  assert.deepEqual(invocation.args, [
    "/app/skills/baoyu-post-to-wechat/scripts/md-to-wechat.ts",
    "/data/jobs/job_1/input.md",
    "--title",
    "标题",
    "--theme",
    "grace",
    "--color",
    "blue",
    "--no-cite",
  ]);
});

test("wechat-api render failure includes spawn diagnostics", () => {
  const message = formatMarkdownRenderFailure({
    error: new Error("spawn bun ENOENT"),
    status: null,
    signal: null,
    stderr: Buffer.from("stderr details"),
    stdout: Buffer.from("stdout details"),
  });

  assert.match(message, /Markdown placeholder render failed/);
  assert.match(message, /spawn bun ENOENT/);
  assert.match(message, /stderr details/);
  assert.match(message, /stdout details/);
});
