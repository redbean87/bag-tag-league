#!/usr/bin/env bash
#
# deploy.sh - Push, version, and update an existing Apps Script web-app deployment.
#
# This script:
#   1. Verifies prerequisites (clasp, authentication, .clasp.json)
#   2. Pushes local Apps Script files (including appsscript.json manifest)
#   3. Creates an immutable version
#   4. Updates the existing deployment in place (preserves the web-app URL)
#
# Usage:
#   bash scripts/deploy.sh [description]
#
# The description argument is optional and defaults to a timestamped message.
#
# Manifest vs. API enforcement:
#   The webapp access/executeAs settings are declared in the appsscript.json
#   manifest file. When clasp pushes and deploys, it passes
#   manifestFileName: 'appsscript' to the Apps Script API, which tells the
#   server to apply the webapp configuration from the manifest. The
#   projects.deployments.update REST endpoint does NOT accept 'access' or
#   'executeAs' as direct request body fields -- these values are sourced
#   exclusively from the manifest.
#

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_ID="1Ou-1vkPscyLViqWgDPkzesRaXR055lsLuV9FXxQcFwjGdiN3BIP6TlvU"
DEPLOYMENT_ID="AKfycbzJMNCZsQfTmrS0hmL0ePZCi2V9B_nvxx9rYA1yYOgmMvgGGtU7SY2Rl4l0TmcshfQ-nw"
DESCRIPTION="${1:-Redeployed via deploy.sh at $(date -u +%Y-%m-%dT%H:%M:%SZ)}"

# Resolve to the directory containing this script, then cd there.
# clasp requires .clasp.json to be in the current working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Preflight checks ───────────────────────────────────────────────────────

# Check required commands
for cmd in clasp node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required but not installed." >&2
    exit 1
  fi
done

# Check .clasp.json exists (we are now cd'd into SCRIPT_DIR)
if [ ! -f ".clasp.json" ]; then
  echo "Error: .clasp.json not found in $(pwd)" >&2
  echo "Expected at: ${SCRIPT_DIR}/.clasp.json" >&2
  exit 1
fi

# Verify clasp is authenticated
if ! clasp show-authorized-user >/dev/null 2>&1; then
  echo "Error: Not authenticated with clasp. Run 'clasp login' first." >&2
  exit 1
fi

echo "=== Apps Script Deployment ==="
echo "Script ID:     ${SCRIPT_ID}"
echo "Deployment ID: ${DEPLOYMENT_ID}"
echo "Description:   ${DESCRIPTION}"
echo ""

# ─── Step 1: Push local files to Apps Script ────────────────────────────────
echo "[1/3] Pushing local files to Apps Script..."
clasp push --force
echo "      Push complete."
echo ""

# ─── Step 2: Create an immutable version ────────────────────────────────────
echo "[2/3] Creating new version..."
VERSION_OUTPUT=$(clasp version "$DESCRIPTION")

# Extract version number. clasp outputs: "Created version <N>"
VERSION=$(echo "$VERSION_OUTPUT" | grep -oE 'Created version [0-9]+' | head -1 | grep -oE '[0-9]+' || true)

if [ -z "$VERSION" ]; then
  echo "Error: Could not determine version number from clasp output." >&2
  echo "Raw output: ${VERSION_OUTPUT}" >&2
  exit 1
fi

echo "      Created version ${VERSION}"
echo ""

# ─── Step 3: Update existing deployment (preserves web-app URL) ─────────────
echo "[3/3] Updating deployment ${DEPLOYMENT_ID} with version ${VERSION}..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --versionNumber "$VERSION" --description "$DESCRIPTION"

echo ""
echo "=== Deployment Complete ==="
echo "Web app URL: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
echo "Version:     ${VERSION}"
