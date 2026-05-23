#!/bin/bash
# ─── Jenkins One-Shot Setup — Fadl Clinic ─────────────────────────────────────
# Run on your Jenkins server as root:
#   curl -fsSL https://raw.githubusercontent.com/saadelkenawy/fc-ams/main/fcams-installation-on-varoius-systems/docker-vm-installation/infra/jenkins/setup.sh | bash
# ──────────────────────────────────────────────────────────────────────────────
set -e

REPO_URL="https://github.com/saadelkenawy/fc-ams.git"
INSTALL_DIR="/opt/fcms"
JENKINS_COMPOSE="$INSTALL_DIR/fcams-installation-on-varoius-systems/docker-vm-installation/infra/jenkins"

echo ""
echo "======================================================"
echo "  Fadl Clinic — Jenkins Setup"
echo "======================================================"
echo ""

# ── 1. Install Docker if missing ──────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[1/5] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[1/5] Docker already installed — skipping."
fi

# ── 2. Install Docker Compose plugin if missing ───────────────────────────────
if ! docker compose version &>/dev/null; then
  echo "[2/5] Installing Docker Compose plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
else
  echo "[2/5] Docker Compose already installed — skipping."
fi

# ── 3. Clone or update the repo ───────────────────────────────────────────────
echo "[3/5] Cloning repository..."
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull origin main
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ── 4. Collect credentials interactively ─────────────────────────────────────
echo ""
echo "[4/5] Enter credentials (input is hidden where sensitive):"
echo ""

read -rp  "  Jenkins admin password : " JENKINS_ADMIN_PASSWORD
read -rsp "  GitHub token (ghp_...) : " GITHUB_TOKEN; echo ""
read -rsp "  Docker Hub token (dckr_pat_...) : " DOCKERHUB_TOKEN; echo ""

# Write .env
cat > "$JENKINS_COMPOSE/.env" <<EOF
JENKINS_ADMIN_PASSWORD=$JENKINS_ADMIN_PASSWORD
GITHUB_TOKEN=$GITHUB_TOKEN
DOCKERHUB_TOKEN=$DOCKERHUB_TOKEN
DEPLOY_SSH_KEY=
EOF

echo ""
echo "  .env written to $JENKINS_COMPOSE/.env"

# ── 5. Start Jenkins ──────────────────────────────────────────────────────────
echo ""
echo "[5/5] Starting Jenkins..."
docker compose -f "$JENKINS_COMPOSE/docker-compose.yml" \
               --env-file "$JENKINS_COMPOSE/.env" \
               up -d --pull always

echo ""
echo "======================================================"
echo "  Waiting for Jenkins to start (up to 90 seconds)..."
echo "======================================================"

for i in $(seq 1 18); do
  sleep 5
  STATUS=$(docker logs fcms-jenkins 2>&1 | grep -c "fully up and running" || true)
  if [ "$STATUS" -gt 0 ]; then
    echo ""
    echo "  Jenkins is fully up and running!"
    echo ""
    echo "  Open in browser: http://192.168.110.100:8080"
    echo "  Username : admin"
    echo "  Password : (what you entered above)"
    echo ""
    exit 0
  fi
  echo "  Still starting... ($((i * 5))s)"
done

echo ""
echo "  Jenkins is taking longer than expected."
echo "  Check logs with:  docker logs fcms-jenkins --tail 30"
