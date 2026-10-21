#!/bin/bash
# ==============================================================================
# install_dgx_service.sh — Universal 1-Click Systemd Service for AI Lab DGX Stations
# ==============================================================================

set -e

RAW_ID="$1"
if [ -z "$RAW_ID" ]; then
    if [ -t 0 ]; then
        read -p "Enter DGX Station / PC Number in AI Lab (1 to 8): " RAW_ID
    fi
fi
if [ -z "$RAW_ID" ]; then
    RAW_ID="$HOSTNAME"
fi

# Normalize to PC-1 ... PC-8 (e.g. 5 -> PC-5, dgx5 -> PC-5, pc5 -> PC-5)
RAW_CLEAN="$(echo "$RAW_ID" | tr '[:lower:]' '[:upper:]')"
if [[ "$RAW_CLEAN" =~ ^[0-9]+$ ]]; then
    PC_ID="PC-$RAW_CLEAN"
elif [[ "$RAW_CLEAN" =~ ^(DGX|PC)[-_]?([0-9]+)$ ]]; then
    PC_ID="PC-${BASH_REMATCH[2]}"
else
    PC_ID="$RAW_CLEAN"
fi

BACKEND_URL="${2:-https://labg418pc12.tailc8c1f6.ts.net}"
INSTALL_DIR="/opt/ai_lab_agent"
SERVICE_NAME="ailab-telemetry.service"

echo "================================================================="
echo "  AI LAB DGX TELEMETRY AUTO-STARTUP & SELF-UPDATE SERVICE"
echo "================================================================="
echo "Target PC ID : $PC_ID"
echo "Backend URL  : $BACKEND_URL"
echo "Install Dir  : $INSTALL_DIR"
echo "================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Please run as root: sudo bash $0 [PC_NUMBER]"
  exit 1
fi

PYTHON_BIN="$(which python3 2>/dev/null || echo /usr/bin/python3)"

# 1. Install Essential Graphics & Screen Capture Packages
echo "📦 Installing screen grab and telemetry packages (scrot, imagemagick, xhost, mss)..."
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

# Install pure-Python mss for direct X11 screen capture
$PYTHON_BIN -m pip install --break-system-packages --quiet mss pillow psutil 2>/dev/null || \
$PYTHON_BIN -m pip install --quiet mss pillow psutil 2>/dev/null || true

# 2. Create Destination Directory and Fetch Python Agent (Server + GitHub Raw Fallback)
mkdir -p "$INSTALL_DIR"
echo "📥 Fetching latest telemetry agent for $PC_ID..."
curl -sSL "$BACKEND_URL/dgx_agent/dgx_telemetry_agent.py" -o "$INSTALL_DIR/dgx_telemetry_agent.py" 2>/dev/null || \
curl -sSL "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/dgx_telemetry_agent.py" -o "$INSTALL_DIR/dgx_telemetry_agent.py"
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
echo "================================================================="
echo "  ✅ SUCCESS! DGX Station '$PC_ID' is permanently LIVE & ACTIVE!"
echo "================================================================="
echo "  • Service name : $SERVICE_NAME"
echo "  • Auto-start   : ENABLED on every reboot / power-on"
echo "  • Auto-update  : ENABLED (Checks hash every 15 min & accepts remote updates)"
echo "  • Check status : sudo systemctl status $SERVICE_NAME"
echo "  • View logs    : sudo journalctl -u $SERVICE_NAME -f"
echo "================================================================="
echo "Aap is terminal ko safely BAND kar sakte hain!"
