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

## Keychain secret store (docs/keychain-env.md): the Figma token comes from the
## environment, else from the macOS keychain through the vendored
## macos-keychain-env. Override the repo, ref and service from the environment.
VENDOR_DIR        := vendor
KEYCHAIN_ENV_DIR  := $(VENDOR_DIR)/macos-keychain-env
KEYCHAIN_ENV_REPO ?= https://github.com/multistageharness/macos-keychain-env
KEYCHAIN_ENV_REF  ?= main
KEYCHAIN_SERVICE  ?= $(or $(FIGMA_KEYCHAIN_SERVICE),figma-api)
KEYCHAIN_KEYS     := FIGMA_TOKEN
KEYCHAIN_CLI      := node $(KEYCHAIN_ENV_DIR)/bin/keychain-env.js

.PHONY: help install build typecheck test check audit test-integration vendor secret secrets clean

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

vendor: ## Clone or fast-forward vendor/macos-keychain-env (keychain secret store; git-ignored)
	@if [ -d "$(KEYCHAIN_ENV_DIR)/.git" ]; then \
	  git -C "$(KEYCHAIN_ENV_DIR)" pull --ff-only --quiet && echo "$(KEYCHAIN_ENV_DIR) up to date ($$(git -C "$(KEYCHAIN_ENV_DIR)" rev-parse --short HEAD))" \
	    || echo "WARN: could not update $(KEYCHAIN_ENV_DIR); using the existing checkout"; \
	else \
	  mkdir -p "$(VENDOR_DIR)" && git clone --quiet --depth 1 --branch "$(KEYCHAIN_ENV_REF)" "$(KEYCHAIN_ENV_REPO)" "$(KEYCHAIN_ENV_DIR)" \
	    && echo "cloned $(KEYCHAIN_ENV_REPO) ($(KEYCHAIN_ENV_REF)) -> $(KEYCHAIN_ENV_DIR)"; \
	fi

secret: vendor ## Store one value in the keychain: make secret KEY=FIGMA_TOKEN (hidden prompt; never on argv)
	@[ -n "$(KEY)" ] || { echo "usage: make secret KEY=<$(subst $() ,|,$(KEYCHAIN_KEYS))>   (hidden prompt; the value never touches argv)"; exit 2; }
	$(KEYCHAIN_CLI) set "$(KEYCHAIN_SERVICE)" "$(KEY)"

secrets: vendor ## List which keychain items exist for this package (reads no values)
	@echo "keychain service: $(KEYCHAIN_SERVICE)"; for k in $(KEYCHAIN_KEYS); do \
	  if $(KEYCHAIN_CLI) has "$(KEYCHAIN_SERVICE)" "$$k" >/dev/null 2>&1; then echo "present  $$k"; else echo "missing  $$k"; fi; done

clean: ## Remove build artifacts
	npm run clean
