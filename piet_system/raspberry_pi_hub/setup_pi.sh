#!/bin/bash
# ==============================================================================
# setup_pi.sh — 1-Click Installer for PIET AIML Dept. Raspberry Pi 5 Central Hub
# ==============================================================================
# Usage:
#   sudo bash setup_pi.sh
# ==============================================================================

set -e

INSTALL_DIR="/opt/piet_system/raspberry_pi_hub"
SERVICE_NAME="piet-lab-hub.service"

echo "================================================================="
echo "  PIET AIML DEPARTMENT — RASPBERRY PI 5 HUB INSTALLER"
echo "================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Please run as root: sudo bash setup_pi.sh"
  exit 1
fi

# 1. Update Packages & Install Python 3
echo "[1/4] Updating package lists & installing Python prerequisites..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv git curl

# 2. Setup Application Directory
echo "[2/4] Setting up hub directory in $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r "$(dirname "$0")"/* "$INSTALL_DIR/" 2>/dev/null || true

# 3. Create Python Virtual Environment
echo "[3/4] Creating virtual environment & installing fast dependencies..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# 4. Generate Systemd Auto-Startup Service
echo "[4/4] Creating auto-startup systemd service ($SERVICE_NAME)..."
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=PIET AIML Department Smart Lab Supervision Hub
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/python3 $INSTALL_DIR/server.py
Restart=always
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo ""
echo "================================================================="
echo "  ✅ SUCCESS! PIET AIML Lab Hub is installed and LIVE!"
echo "================================================================="
echo "Status check : sudo systemctl status $SERVICE_NAME"
echo "Live logs    : sudo journalctl -u $SERVICE_NAME -f"
echo "Web Portal   : http://$(hostname -I | awk '{print $1}'):8000/"
echo "================================================================="
