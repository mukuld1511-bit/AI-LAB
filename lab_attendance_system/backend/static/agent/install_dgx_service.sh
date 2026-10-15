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

PYTHON_BIN="$(which python3 2>/dev/null || echo /usr/bin/python3)"

# 1. Install Essential Graphics & Screen Capture Packages
echo "📦 Installing screen grab and telemetry packages (scrot, imagemagick, xhost, mss, grim)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq \
    scrot \
    imagemagick \
    x11-xserver-utils \
    xdotool \
    grim \
    slurp \
    gnome-screenshot \
    python3-pil \
    python3-pip \
    python3-psutil 2>/dev/null || true

# Install pure-Python mss for lightning-fast direct X11 capture
$PYTHON_BIN -m pip install --break-system-packages --quiet mss pillow psutil 2>/dev/null || \
$PYTHON_BIN -m pip install --quiet mss pillow psutil 2>/dev/null || true

# 2. Create Destination Directory and Fetch Python Agent
mkdir -p "$INSTALL_DIR"
echo "📥 Fetching latest telemetry agent from $BACKEND_URL/dgx_agent/dgx_telemetry_agent.py..."
curl -sSL "$BACKEND_URL/dgx_agent/dgx_telemetry_agent.py" -o "$INSTALL_DIR/dgx_telemetry_agent.py"
chmod +x "$INSTALL_DIR/dgx_telemetry_agent.py"

# 3. Generate Systemd Service
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=AI ML Lab DGX Telemetry & Heartbeat Daemon
After=network.target graphical.target

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

# 4. Reload & Enable Service
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo ""
echo "✅ SUCCESS! Service '$SERVICE_NAME' is installed and active."
echo "Status check: sudo systemctl status $SERVICE_NAME"
echo "Live logs   : sudo journalctl -u $SERVICE_NAME -f"
echo "================================================================="
