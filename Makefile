##
## @internal/figma-find — self-contained Makefile
##
## figma-find CLI + SDK: find, xpath, path, pages, comments, annotations,
## dev-resources and federated search over Figma files. `make audit` is the
## offline gate (typecheck + test + check — no network, no token);
## `make test-integration` runs live against a real Figma file and skips
## without a token. `make install` is a plain npm install.
##
SHELL := /bin/bash
.DEFAULT_GOAL := help
.ONESHELL:
.SHELLFLAGS := -euo pipefail -c

.PHONY: help install build typecheck test check audit test-integration clean

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

build: ## Compile TypeScript to dist/
	npm run build

typecheck: ## Run tsc --noEmit
	npm run typecheck

test: ## Run vitest once
	npm test

check: ## Run biome check (format + lint)
	npm run check

audit: typecheck test check ## Offline gate: typecheck + test + check (no network, no token)

test-integration: ## Live tests against a real Figma file (manifest-gated; skips without a token)
	npm run test:integration

clean: ## Remove build artifacts
	npm run clean
