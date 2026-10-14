#!/bin/bash
# ==============================================================================
# update_raspberry_pi.sh — Complete Update & Persistent Boot Automation for Pi
# ==============================================================================
# Run on Raspberry Pi:
#   git pull
#   sudo bash piet_system/update_raspberry_pi.sh
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Please run as root: sudo bash piet_system/update_raspberry_pi.sh"
  exit 1
fi

echo "========================================================================"
echo "  🚀 PIET AIML DEPT — RASPBERRY PI 1 (LAB 414) AUTO-UPDATE & BOOT SETUP"
echo "========================================================================"

INSTALL_DIR="/opt/piet_system/raspberry_pi_hub"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -d "$REPO_DIR/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/piet_system/raspberry_pi_hub"
elif [ -d "$REPO_DIR/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/raspberry_pi_hub"
else
    HUB_SRC="$(cd "$(dirname "$0")" && pwd)/raspberry_pi_hub"
fi

echo "[1/5] Updating files in $INSTALL_DIR from $HUB_SRC..."
mkdir -p "$INSTALL_DIR"
cp -r "$HUB_SRC"/* "$INSTALL_DIR/"

# Ensure virtualenv exists
if [ ! -d "$INSTALL_DIR/venv" ]; then
    echo "Creating Python venv..."
    python3 -m venv "$INSTALL_DIR/venv"
    "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
    "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
fi

# Ensure permissions
chmod -R 755 "$INSTALL_DIR"

echo "[2/5] Initializing Database & 20 Workstation Inventory for Lab 414..."
"$INSTALL_DIR/venv/bin/python3" -c "import sys; sys.path.append('$INSTALL_DIR'); import database; database.init_db(); print('✅ Database updated with 20 PC inventory.')"

echo "[3/5] Setting up Hub Auto-Start Service on Boot..."
cat << 'EOF' > /etc/systemd/system/piet-lab-hub.service
[Unit]
Description=PIET AIML Department Smart Lab Supervision Hub
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/piet_system/raspberry_pi_hub
ExecStart=/opt/piet_system/raspberry_pi_hub/venv/bin/python3 /opt/piet_system/raspberry_pi_hub/server.py
Restart=always
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "[4/5] Setting up Tailscale Funnel Auto-Start on Boot..."
cat << 'EOF' > /etc/systemd/system/piet-funnel.service
[Unit]
Description=Tailscale Funnel Auto-Start for PIET Lab Hub
After=network-online.target tailscaled.service piet-lab-hub.service
Wants=network-online.target tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/tailscale funnel --bg 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "[5/5] Enabling and starting persistent boot services..."
systemctl daemon-reload
systemctl enable piet-lab-hub.service
systemctl enable piet-funnel.service
systemctl restart piet-lab-hub.service
sleep 2
systemctl restart piet-funnel.service || tailscale funnel --bg 8000

# Get Local LAN IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="10.9.3.3"

echo ""
echo "========================================================================"
echo "  ✅ SUCCESS! Raspberry Pi Hub & Funnel are now PERMANENTLY AUTOMATED"
echo "========================================================================"
echo "  1. Piet Lab Hub Service  : ACTIVE & ENABLED (Auto-starts on boot)"
echo "  2. Tailscale Funnel      : ACTIVE & ENABLED (Auto-starts on boot)"
echo "  3. Workstations          : 20 PC slots configured (Clean Light Theme)"
echo ""
echo "  🌐 Public Internet URL   : https://raspberrypi.tailc8c1f6.ts.net/"
echo "  🏢 Local Lab LAN URL     : http://${LOCAL_IP}:8000/"
echo "========================================================================"
