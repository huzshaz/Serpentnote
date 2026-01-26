.PHONY: dev

# Get the directory path of the Makefile
WORKDIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# Read port config from parent .apps-db.json
APP_ID := $(notdir $(WORKDIR))
APPS_DB := $(WORKDIR)/../.apps-db.json

FRONTEND_PORT ?= $(shell \
	if [ -f "$(APPS_DB)" ] && command -v jq >/dev/null 2>&1; then \
		jq -r ".[\"$(APP_ID)\"].frontendPort // \"9001\"" "$(APPS_DB)" 2>/dev/null || echo "9001"; \
	else \
		echo "9001"; \
	fi)

dev:
	@cd $(WORKDIR) && bun install
	@# 清理端口 (使用 fuser，兼容 Alpine 和其他 Linux)
	@fuser -k $(FRONTEND_PORT)/tcp 2>/dev/null || true
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	@cd $(WORKDIR) && FRONTEND_PORT=$(FRONTEND_PORT) bun run dev
