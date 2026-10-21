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

# Auto-heal DNS immediately
if [ -f /etc/resolv.conf ]; then
    if ! grep -q "^nameserver 8.8.8.8" /etc/resolv.conf 2>/dev/null; then
        sed -i '1i nameserver 8.8.8.8' /etc/resolv.conf 2>/dev/null || echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf 2>/dev/null || true
    fi
fi

INSTALL_DIR="/opt/piet_system/raspberry_pi_hub"
REPO_DIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo "")"

if [ -n "$REPO_DIR" ] && [ -d "$REPO_DIR/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/piet_system/raspberry_pi_hub"
    # Pull latest if inside git repo
    (cd "$REPO_DIR" && git pull origin main 2>/dev/null || true)
elif [ -n "$REPO_DIR" ] && [ -d "$REPO_DIR/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/raspberry_pi_hub"
elif [ -d "/home/$SUDO_USER/AI-LAB/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="/home/$SUDO_USER/AI-LAB/piet_system/raspberry_pi_hub"
    (cd "/home/$SUDO_USER/AI-LAB" && git pull origin main 2>/dev/null || true)
elif [ -d "/home/pi/AI-LAB/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="/home/pi/AI-LAB/piet_system/raspberry_pi_hub"
    (cd "/home/pi/AI-LAB" && git pull origin main 2>/dev/null || true)
elif [ -d "/home/piet/AI-LAB/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="/home/piet/AI-LAB/piet_system/raspberry_pi_hub"
    (cd "/home/piet/AI-LAB" && git pull origin main 2>/dev/null || true)
else
    echo "📥 Cloning latest repository directly from GitHub..."
    TMP_SRC="/tmp/ai_lab_git_pi"
    rm -rf "$TMP_SRC"
    git clone --depth 1 https://github.com/mukuld1511-bit/AI-LAB.git "$TMP_SRC"
    HUB_SRC="$TMP_SRC/piet_system/raspberry_pi_hub"
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

echo "[2/5] Initializing Database & 120 Workstation Inventory (Labs 413, 414, 415, 418, 419)..."
"$INSTALL_DIR/venv/bin/python3" -c "import sys; sys.path.append('$INSTALL_DIR'); import database; database.init_db(); print('✅ Database updated with 5 Labs (120 PCs) inventory.')"

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
echo "  3. Workstations          : 5 Labs (120 PCs: 413, 414, 415, 418, 419 - 24 PCs each)"
echo ""
echo "  🌐 Public Internet URL   : https://raspberrypi.tailc8c1f6.ts.net/"
echo "  🏢 Local Lab LAN URL     : http://${LOCAL_IP}:8000/"
echo "========================================================================"
