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

  it("forwards the image generation response format", () => {
    const invocation = buildInvocation({
      skill: "baoyu-image-gen",
      workDir: "/tmp/job",
      input: {
        prompt: "A mountain lake",
        responseFormat: "url",
      },
    });

    assert.equal(invocation.kind, "cli");
    assert.deepEqual(invocation.args, [
      "skills/baoyu-image-gen/scripts/main.ts",
      "--prompt",
      "A mountain lake",
      "--image",
      "/tmp/job/output/image.png",
      "--response-format",
      "url",
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

  it("builds structured WeChat API args for markdown input", () => {
    const invocation = buildInvocation({
      skill: "baoyu-post-to-wechat",
      operation: "api",
      input: {
        markdown: "# Title\n\nBody",
        theme: "grace",
        color: "blue",
        title: "文章标题",
        author: "宝玉",
        summary: "摘要",
        sourceUrl: "https://example.com/original",
        cover: "imgs/cover.png",
        account: "main",
        noCite: true,
        dryRun: true,
        remote: true,
        remoteHost: "server.example.com",
        remoteUser: "deploy",
        remotePort: "2222",
        remoteIdentityFile: "/home/deploy/.ssh/id_ed25519",
        remoteKnownHostsFile: "/home/deploy/.ssh/known_hosts",
        remoteStrictHostKeyChecking: "accept-new",
        remoteConnectTimeout: "15",
        remoteProxyJump: "jump.example.com",
      },
      workDir: "/data/jobs/job_wechat",
    });

    assert.equal(invocation.kind, "cli");
    assert.deepEqual(invocation.args, [
      "skills/baoyu-post-to-wechat/scripts/wechat-api.ts",
      "/data/jobs/job_wechat/input.md",
      "--theme",
      "grace",
      "--color",
      "blue",
      "--title",
      "文章标题",
      "--author",
      "宝玉",
      "--summary",
      "摘要",
      "--source-url",
      "https://example.com/original",
      "--cover",
      "/data/jobs/job_wechat/imgs/cover.png",
      "--account",
      "main",
      "--no-cite",
      "--dry-run",
      "--remote",
      "--remote-host",
      "server.example.com",
      "--remote-user",
      "deploy",
      "--remote-port",
      "2222",
      "--remote-identity-file",
      "/home/deploy/.ssh/id_ed25519",
      "--remote-known-hosts-file",
      "/home/deploy/.ssh/known_hosts",
      "--remote-strict-host-key-checking",
      "accept-new",
      "--remote-connect-timeout",
      "15",
      "--remote-proxy-jump",
      "jump.example.com",
    ]);
  });

  it("builds structured WeChat API args for html input", () => {
    const invocation = buildInvocation({
      skill: "baoyu-post-to-wechat",
      operation: "api",
      input: {
        html: "<html><head><title>Title</title></head><body>Body</body></html>",
        title: "HTML 标题",
        cover: "/shared/cover.png",
      },
      workDir: "/data/jobs/job_html",
    });

    assert.equal(invocation.kind, "cli");
    assert.deepEqual(invocation.args, [
      "skills/baoyu-post-to-wechat/scripts/wechat-api.ts",
      "/data/jobs/job_html/input.html",
      "--title",
      "HTML 标题",
      "--cover",
      "/shared/cover.png",
    ]);
  });

  it("keeps rawArgs as the WeChat API escape hatch", () => {
    const invocation = buildInvocation({
      skill: "baoyu-post-to-wechat",
      operation: "api",
      input: {
        markdown: "# Ignored",
        rawArgs: ["/data/articles/manual.md", "--theme", "modern"],
      },
      workDir: "/data/jobs/job_raw",
    });

    assert.equal(invocation.kind, "cli");
    assert.deepEqual(invocation.args, [
      "skills/baoyu-post-to-wechat/scripts/wechat-api.ts",
      "/data/articles/manual.md",
      "--theme",
      "modern",
    ]);
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
