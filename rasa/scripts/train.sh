#!/usr/bin/env bash
# Retrain the NLU model, evaluate it, and keep a versioned copy of the artifact.
#
#   rasa/scripts/train.sh            # tag = today's date, e.g. 2026-10-27
#   rasa/scripts/train.sh v3         # explicit tag
#
# Steps: build the image (trains the model inside it) → start it on a spare
# port → run the held-out evaluation → export rasa/models/ai-employee-nlu-<tag>.tar.gz.
# Deploy by setting RASA_MODEL_VERSION=<tag> in .env and `docker compose up -d --build rasa`.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

TAG="${1:-$(date +%Y-%m-%d)}"
IMAGE="ai-employee-rasa:${TAG}"
PORT="${RASA_EVAL_PORT:-5055}"
TOKEN="eval-$(date +%s)"

echo "==> Training ($IMAGE)"
docker build -t "$IMAGE" -f rasa/Dockerfile rasa

echo "==> Evaluating on rasa/tests/test_nlu.yml"
CID="$(docker run -d --rm -p "127.0.0.1:${PORT}:5005" -e RASA_AUTH_TOKEN="$TOKEN" "$IMAGE")"
trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/version")" = 200 ] && break
  sleep 3
done
RASA_URL="http://localhost:${PORT}" RASA_AUTH_TOKEN="$TOKEN" python3 rasa/scripts/evaluate.py | tee "rasa/results/evaluation-${TAG}.txt" || {
  echo "!! Evaluation reported wrongly routed messages (see above). Not exporting."; exit 1; }

echo "==> Exporting model artifact"
mkdir -p rasa/models
TMP="$(docker create "$IMAGE")"
docker cp "$TMP:/app/models/ai-employee-nlu.tar.gz" "rasa/models/ai-employee-nlu-${TAG}.tar.gz"
docker rm "$TMP" >/dev/null
echo "Saved rasa/models/ai-employee-nlu-${TAG}.tar.gz"
