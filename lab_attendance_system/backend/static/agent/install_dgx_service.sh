#!/bin/bash
# ==============================================================================
# install_dgx_service.sh — 1-Click Linux Systemd Auto-Startup Service for DGX
# ==============================================================================

set -e

PC_ID="${1:-$HOSTNAME}"
BACKEND_URL="${2:-https://labg418pc12.tailc8c1f6.ts.net}"
INSTALL_DIR="/opt/ai_lab_agent"
SERVICE_NAME="ailab-telemetry.service"

echo "================================================================="
echo "  AI/ML LAB DGX TELEMETRY AUTO-STARTUP SERVICE INSTALLER"
echo "================================================================="
echo "Target PC ID : $PC_ID"
echo "Backend URL  : $BACKEND_URL"
echo "Install Dir  : $INSTALL_DIR"
echo "================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Please run as root: sudo bash install_dgx_service.sh [PC_ID]"
  exit 1
fi

# 1. Create Destination Directory and Fetch Python Agent
mkdir -p "$INSTALL_DIR"
if [ -f "$(dirname "$0")/dgx_telemetry_agent.py" ]; then
  cp "$(dirname "$0")/dgx_telemetry_agent.py" "$INSTALL_DIR/dgx_telemetry_agent.py"
else
  echo "📥 Downloading telemetry agent from $BACKEND_URL/dgx_agent/dgx_telemetry_agent.py..."
  curl -sSL "$BACKEND_URL/dgx_agent/dgx_telemetry_agent.py" -o "$INSTALL_DIR/dgx_telemetry_agent.py"
fi
chmod +x "$INSTALL_DIR/dgx_telemetry_agent.py"

PYTHON_BIN="$(which python3 2>/dev/null || echo /usr/bin/python3)"

# 2. Generate Systemd Service
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=AI ML Lab DGX Telemetry & Heartbeat Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$PYTHON_BIN $INSTALL_DIR/dgx_telemetry_agent.py --pc-id $PC_ID --url $BACKEND_URL
Restart=always
RestartSec=5
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

# 3. Reload & Enable Service
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo ""
echo "✅ SUCCESS! Service '$SERVICE_NAME' is installed and active."
echo "Status check: sudo systemctl status $SERVICE_NAME"
echo "Live logs   : sudo journalctl -u $SERVICE_NAME -f"
echo "================================================================="
