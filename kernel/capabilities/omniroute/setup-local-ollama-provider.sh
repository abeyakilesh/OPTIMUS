#!/usr/bin/env bash
# Registers a local Ollama instance as an OmniRoute provider, over OmniRoute's
# own real HTTP admin API — the same two calls its dashboard UI makes, no
# internal module imports. Idempotent-ish: re-running creates a second node
# if one already exists; check `curl $BASE_URL/api/provider-nodes` first if
# that matters to you.
#
# Preconditions:
#   - An OmniRoute server already running and reachable at $BASE_URL
#     (see this directory's README for how to start one).
#   - Ollama running locally with at least one model pulled
#     (`ollama pull llama3.2` if you have none).
#
# Usage:
#   OMNIROUTE_PASSWORD=CHANGEME ./setup-local-ollama-provider.sh
set -euo pipefail

BASE_URL="${OMNIROUTE_BASE_URL:-http://127.0.0.1:20128}"
PASSWORD="${OMNIROUTE_PASSWORD:-CHANGEME}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434/v1}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "→ logging in to $BASE_URL"
curl -sf -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}" > /dev/null

echo "→ creating provider node pointing at $OLLAMA_BASE_URL"
NODE_JSON=$(curl -sf -b "$COOKIE_JAR" -X POST "$BASE_URL/api/provider-nodes" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"openai-compatible\",\"name\":\"Local Ollama\",\"prefix\":\"ollama\",\"apiType\":\"chat\",\"baseUrl\":\"$OLLAMA_BASE_URL\"}")
NODE_ID=$(node -e "console.log(JSON.parse(process.argv[1]).node.id)" "$NODE_JSON")
echo "  node: $NODE_ID"

echo "→ creating provider connection"
curl -sf -b "$COOKIE_JAR" -X POST "$BASE_URL/api/providers" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"$NODE_ID\",\"apiKey\":\"not-needed-for-ollama\",\"name\":\"ollama-local\",\"testStatus\":\"active\"}" > /dev/null

echo "→ done. Try it:"
echo "  curl -X POST $BASE_URL/v1/chat/completions -H 'Content-Type: application/json' \\"
echo "    -d '{\"model\":\"ollama/<your-pulled-model>\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'"
