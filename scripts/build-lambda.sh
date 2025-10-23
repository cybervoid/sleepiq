#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="${ROOT_DIR}/lambda-package"
ZIP_PATH="${ROOT_DIR}/function.zip"

echo "🧹 Cleaning previous build..."
rm -rf "${PKG_DIR}" "${ZIP_PATH}"
mkdir -p "${PKG_DIR}"

echo "🔨 Compiling TypeScript to JavaScript..."
pushd "${ROOT_DIR}" >/dev/null
npm run build
popd >/dev/null

echo "📦 Copying Lambda code and compiled app sources..."
# Lambda code
rsync -av --exclude="*.test.*" --exclude="__tests__" "${ROOT_DIR}/lambda/" "${PKG_DIR}/lambda/"

# Compiled JavaScript files from dist/ (TypeScript output)
if [[ ! -d "${ROOT_DIR}/dist" ]]; then
  echo "❌ Error: dist/ directory not found. TypeScript compilation may have failed."
  exit 1
fi
rsync -av --exclude="*.test.*" --exclude="__tests__" --exclude="*.d.ts" --exclude="*.map" "${ROOT_DIR}/dist/" "${PKG_DIR}/src/"

# Package manifests
cp "${ROOT_DIR}/package.json" "${PKG_DIR}/package.json"
if [[ -f "${ROOT_DIR}/package-lock.json" ]]; then
  cp "${ROOT_DIR}/package-lock.json" "${PKG_DIR}/package-lock.json"
fi

echo "📥 Installing production dependencies..."
pushd "${PKG_DIR}" >/dev/null
npm ci --omit=dev --quiet
npm prune --omit=dev
popd >/dev/null

echo "🗜️  Creating zip..."
pushd "${PKG_DIR}" >/dev/null
# Exclude non-runtime artifacts explicitly
zip -qr "${ZIP_PATH}" . \
  -x "**/*.md" \
     "**/*.map" \
     "**/__tests__/**" \
     "**/*.test.*" \
     "Dockerfile" \
     ".dockerignore" \
     "docker-run.sh" \
     "DOCKER.md"
popd >/dev/null

echo "✅ Done! Package at ${ZIP_PATH}"
ls -lh "${ZIP_PATH}"
