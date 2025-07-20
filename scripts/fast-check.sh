#!/bin/bash
# Fast cargo check script with optimizations

# Export variables for faster compilation
export CARGO_INCREMENTAL=1
export CARGO_BUILD_JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Use cargo check with minimal compilation
echo "🚀 Running fast cargo check..."

# Change to src-tauri directory
cd "$(dirname "$0")/../src-tauri" || exit 1

# Check if we can use cached results
if cargo check --message-format=short 2>/dev/null | grep -q "Finished"; then
    echo "✅ No changes detected - using cached results"
    exit 0
fi

# Run cargo check with optimizations
cargo check \
    --message-format=short \
    --jobs=$CARGO_BUILD_JOBS

echo "✅ Cargo check completed"