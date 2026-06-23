# Changelog

## Unreleased

### Added
- Add `baoyu-worker` as a private HTTP worker layer for running `baoyu-skills` jobs from tools such as n8n.
- Add Docker and Docker Compose deployment assets.
- Add `/health`, `/v1/skills`, `/v1/jobs`, job polling, output file downloads, and optional completion webhooks.
- Add support for CLI, instruction-driven, and hybrid skill operations through a fixed registry.
- Add grouped environment variable passthrough for image providers, browser-auth workflows, publishing skills, cookies, and proxies.
- Add structured WeChat API publishing inputs for worker jobs, including inline Markdown/HTML, uploaded files, cover paths, account selection, dry runs, and remote SOCKS publishing options.
- Add host deployment notes for the private `kingdomwang55/baoyu-skills.git` `worker-main` branch.

### Fixed
- Run the WeChat Markdown renderer through Bun when invoked from worker publishing flows.
