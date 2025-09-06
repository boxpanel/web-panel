# Web Panel Makefile
# 支持跨平台构建，参考1Panel的构建方式

# 变量定义
APP_NAME := web-panel
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Go 相关变量
GO := go
GOFLAGS := -ldflags "-X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME) -X main.GitCommit=$(GIT_COMMIT) -w -s"
GOOS := $(shell go env GOOS)
GOARCH := $(shell go env GOARCH)

# 目录定义
CMD_DIR := ./cmd
BUILD_DIR := ./build
DIST_DIR := ./dist

# 支持的平台
PLATFORMS := linux/amd64 linux/arm64 linux/arm darwin/amd64 darwin/arm64 windows/amd64

# 默认目标
.PHONY: all
all: clean deps build

# 安装依赖
.PHONY: deps
deps:
	@echo "Installing dependencies..."
	$(GO) mod download
	$(GO) mod tidy

# 构建当前平台
.PHONY: build
build: deps
	@echo "Building $(APP_NAME) for $(GOOS)/$(GOARCH)..."
	@mkdir -p $(BUILD_DIR)
	$(GO) build $(GOFLAGS) -o $(BUILD_DIR)/$(APP_NAME) $(CMD_DIR)/main.go
	@echo "Build completed: $(BUILD_DIR)/$(APP_NAME)"

# 构建所有平台
.PHONY: build-all
build-all: clean deps
	@echo "Building for all platforms..."
	@mkdir -p $(DIST_DIR)
	$(foreach platform,$(PLATFORMS),\
		$(call build_platform,$(platform)))

# 构建特定平台的函数
define build_platform
	$(eval GOOS_ARCH := $(subst /, ,$(1)))
	$(eval GOOS_VAL := $(word 1,$(GOOS_ARCH)))
	$(eval GOARCH_VAL := $(word 2,$(GOOS_ARCH)))
	@echo "Building for $(GOOS_VAL)/$(GOARCH_VAL)..."
	@GOOS=$(GOOS_VAL) GOARCH=$(GOARCH_VAL) $(GO) build $(GOFLAGS) \
		-o $(DIST_DIR)/$(APP_NAME)-$(GOOS_VAL)-$(GOARCH_VAL)$(if $(filter windows,$(GOOS_VAL)),.exe,) \
		$(CMD_DIR)/main.go
endef

# 运行应用
.PHONY: run
run: build
	@echo "Running $(APP_NAME)..."
	@cd $(BUILD_DIR) && ./$(APP_NAME)

# 开发模式运行
.PHONY: dev
dev:
	@echo "Running in development mode..."
	$(GO) run $(CMD_DIR)/main.go

# 测试
.PHONY: test
test:
	@echo "Running tests..."
	$(GO) test -v ./...

# 测试覆盖率
.PHONY: test-coverage
test-coverage:
	@echo "Running tests with coverage..."
	$(GO) test -v -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# 代码检查
.PHONY: lint
lint:
	@echo "Running linter..."
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not found, running go vet..."; \
		$(GO) vet ./...; \
	fi

# 格式化代码
.PHONY: fmt
fmt:
	@echo "Formatting code..."
	$(GO) fmt ./...

# 清理构建文件
.PHONY: clean
clean:
	@echo "Cleaning build files..."
	@rm -rf $(BUILD_DIR) $(DIST_DIR)
	@rm -f coverage.out coverage.html

# 安装到系统
.PHONY: install
install: build
	@echo "Installing $(APP_NAME)..."
	@sudo cp $(BUILD_DIR)/$(APP_NAME) /usr/local/bin/
	@echo "$(APP_NAME) installed to /usr/local/bin/"

# 卸载
.PHONY: uninstall
uninstall:
	@echo "Uninstalling $(APP_NAME)..."
	@sudo rm -f /usr/local/bin/$(APP_NAME)
	@echo "$(APP_NAME) uninstalled"

# 创建发布包
.PHONY: release
release: build-all
	@echo "Creating release packages..."
	@mkdir -p $(DIST_DIR)/packages
	@for file in $(DIST_DIR)/$(APP_NAME)-*; do \
		if [ -f "$$file" ]; then \
			basename=$$(basename "$$file"); \
			platform=$${basename#$(APP_NAME)-}; \
			platform=$${platform%.exe}; \
			echo "Packaging $$platform..."; \
			tar -czf "$(DIST_DIR)/packages/$(APP_NAME)-$$platform.tar.gz" -C "$(DIST_DIR)" "$$basename"; \
		fi; \
	done
	@echo "Release packages created in $(DIST_DIR)/packages/"

# Docker 构建
.PHONY: docker-build
docker-build:
	@echo "Building Docker image..."
	@if [ -f "Dockerfile" ]; then \
		docker build -t $(APP_NAME):$(VERSION) .; \
		docker build -t $(APP_NAME):latest .; \
	else \
		echo "Dockerfile not found"; \
		exit 1; \
	fi

# 显示版本信息
.PHONY: version
version:
	@echo "App Name: $(APP_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Build Time: $(BUILD_TIME)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Go Version: $(shell $(GO) version)"
	@echo "Platform: $(GOOS)/$(GOARCH)"

# 显示帮助信息
.PHONY: help
help:
	@echo "Web Panel Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  all          - Clean, install deps and build for current platform"
	@echo "  build        - Build for current platform"
	@echo "  build-all    - Build for all supported platforms"
	@echo "  run          - Build and run the application"
	@echo "  dev          - Run in development mode"
	@echo "  test         - Run tests"
	@echo "  test-coverage- Run tests with coverage report"
	@echo "  lint         - Run code linter"
	@echo "  fmt          - Format code"
	@echo "  clean        - Clean build files"
	@echo "  deps         - Install dependencies"
	@echo "  install      - Install to system"
	@echo "  uninstall    - Uninstall from system"
	@echo "  release      - Create release packages"
	@echo "  docker-build - Build Docker image"
	@echo "  version      - Show version information"
	@echo "  help         - Show this help message"
	@echo ""
	@echo "Supported platforms: $(PLATFORMS)"
	@echo ""
	@echo "Examples:"
	@echo "  make build                    # Build for current platform"
	@echo "  make build-all               # Build for all platforms"
	@echo "  GOOS=linux GOARCH=amd64 make build  # Build for specific platform"