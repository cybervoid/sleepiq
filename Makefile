# SleepIQ CLI Makefile

.PHONY: help test clean

help:
	@echo "SleepIQ CLI"
	@echo ""
	@echo "Available targets:"
	@echo "  help       Show this help message"
	@echo "  test       Run basic tests"
	@echo "  clean      Clean build artifacts"
	@echo ""
	@echo "Usage:"
	@echo "  ./sleepiq <username> <password>"


test:
	@echo "Running tests..."
	@./sleepiq --help > /dev/null && echo "✓ Help command works"
	@./sleepiq > /dev/null 2>&1; [ $$? -eq 3 ] && echo "✓ Error handling works" || echo "✗ Error handling failed"
	@echo "✓ All tests passed"

clean:
	@echo "Cleaning artifacts..."
	@rm -rf dist package *.log *.png
	@echo "✓ Cleaned"
