import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const composePath = "apps/baoyu-worker/docker-compose.example.yml";
const envExamplePath = "apps/baoyu-worker/.env.example";

const requiredEnvGroups: Record<string, string[]> = {
  worker: [
    "BAOYU_WORKER_TOKEN",
    "BAOYU_WORKER_DATA_DIR",
    "BAOYU_CHROME_PROFILE_DIR",
    "PORT",
    "HOST",
  ],
  openaiCompatible: [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_IMAGE_MODEL",
    "OPENAI_IMAGE_API_DIALECT",
    "OPENAI_IMAGE_USE_CHAT",
  ],
  googleGemini: [
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_BASE_URL",
    "GOOGLE_IMAGE_MODEL",
  ],
  openrouter: [
    "OPENROUTER_API_KEY",
    "OPENROUTER_BASE_URL",
    "OPENROUTER_HTTP_REFERER",
    "OPENROUTER_TITLE",
    "OPENROUTER_IMAGE_MODEL",
  ],
  chineseAndGatewayProviders: [
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_BASE_URL",
    "DASHSCOPE_IMAGE_MODEL",
    "ARK_API_KEY",
    "SEEDREAM_BASE_URL",
    "SEEDREAM_IMAGE_MODEL",
    "ZAI_API_KEY",
    "BIGMODEL_API_KEY",
    "ZAI_BASE_URL",
    "BIGMODEL_BASE_URL",
    "ZAI_IMAGE_MODEL",
    "BIGMODEL_IMAGE_MODEL",
    "MINIMAX_API_KEY",
    "MINIMAX_BASE_URL",
    "MINIMAX_IMAGE_MODEL",
    "JIMENG_ACCESS_KEY_ID",
    "JIMENG_SECRET_ACCESS_KEY",
    "JIMENG_REGION",
    "JIMENG_BASE_URL",
    "JIMENG_IMAGE_MODEL",
  ],
  azureAndReplicate: [
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_DEPLOYMENT",
    "AZURE_OPENAI_IMAGE_MODEL",
    "AZURE_API_VERSION",
    "REPLICATE_API_TOKEN",
    "REPLICATE_BASE_URL",
    "REPLICATE_IMAGE_MODEL",
  ],
  agnes: [
    "AGNES_API_KEY",
    "AGNES_BASE_URL",
    "AGNES_IMAGE_MODEL",
    "BAOYU_IMAGE_GEN_AGNES_CONCURRENCY",
    "BAOYU_IMAGE_GEN_AGNES_START_INTERVAL_MS",
  ],
  browserAndPlatformSkills: [
    "GEMINI_WEB_DATA_DIR",
    "GEMINI_WEB_COOKIE_PATH",
    "GEMINI_WEB_CHROME_PROFILE_DIR",
    "GEMINI_WEB_CHROME_PATH",
    "GEMINI_WEB_LOGIN",
    "GEMINI_WEB_FORCE_LOGIN",
    "X_AUTH_TOKEN",
    "X_CT0",
    "X_GUEST_TOKEN",
    "X_TWID",
    "X_BEARER_TOKEN",
    "X_USER_AGENT",
    "X_CLIENT_TRANSACTION_ID",
    "X_DATA_DIR",
    "X_COOKIE_PATH",
    "X_CHROME_PROFILE_DIR",
    "WECHAT_BROWSER_PROFILE_DIR",
    "WECHAT_BROWSER_CHROME_PATH",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
    "WEIBO_BROWSER_PROFILE_DIR",
    "WEIBO_BROWSER_CHROME_PATH",
    "X_BROWSER_PROFILE_DIR",
    "X_BROWSER_CHROME_PATH",
    "YOUTUBE_TRANSCRIPT_COOKIES_FROM_BROWSER",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "XDG_CONFIG_HOME",
  ],
  codexAndNetwork: [
    "CODEX_HOME",
    "BAOYU_CODEX_IMAGEGEN_BIN",
    "BAOYU_CODEX_IMAGEGEN_TIMEOUT_MS",
    "BAOYU_CODEX_IMAGEGEN_RETRIES",
    "BAOYU_IMAGE_GEN_MAX_WORKERS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
  ],
};

function flattenGroups() {
  return [...new Set(Object.values(requiredEnvGroups).flat())].sort();
}

function composeEnvNames(): string[] {
  const compose = readFileSync(composePath, "utf8");
  return [...compose.matchAll(/^ {6}([A-Z0-9_]+):/gm)].map((match) => match[1]!).sort();
}

function envExampleNames(): string[] {
  const envExample = readFileSync(envExamplePath, "utf8");
  return [...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]!).sort();
}

describe("baoyu-worker deployment config", () => {
  it("passes through every environment variable used by wrapped skills", () => {
    assert.deepEqual(composeEnvNames(), flattenGroups());
  });

  it("documents every pass-through variable in the env example", () => {
    assert.deepEqual(envExampleNames(), flattenGroups());
  });
});
