#!/bin/bash

# Fast test script with optimizations
set -e

echo "🚀 Running fast Rust tests..."

cd src-tauri

# Set environment variables for faster compilation
export CARGO_INCREMENTAL=0
export RUSTFLAGS="-C debug-assertions=off -C overflow-checks=off"
export CARGO_TARGET_DIR="target"

# Use multiple cores for parallel testing
export CARGO_BUILD_JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Run tests with optimizations
cargo test \
  --workspace \
  --all-features \
  --jobs $CARGO_BUILD_JOBS \
  --target-dir target \
  -- \
  --test-threads $(($CARGO_BUILD_JOBS / 2))

echo "✅ Fast tests completed!"