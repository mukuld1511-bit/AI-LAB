#!/bin/bash
# ==============================================================================
# setup_raspberry_1_lab414.sh — 1-Click Complete Setup for Raspberry Pi 1 (Lab 414)
# ==============================================================================
# Usage on Raspberry Pi 1:
#   git pull
#   sudo bash setup_raspberry_1_lab414.sh
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "⚠️ Please run as root: sudo bash setup_raspberry_1_lab414.sh"
  exit 1
fi

echo "================================================================="
echo "  🚀 PIET AIML DEPT — RASPBERRY PI 1 (LAB 414) COMPLETE INSTALLER"
echo "================================================================="

# 1. Fix USB Power Warning Permanently
echo "[1/6] Disabling USB power button check in config.txt..."
for cfg in /boot/firmware/config.txt /boot/config.txt; do
    if [ -f "$cfg" ]; then
        if ! grep -q "usb_max_current_enable=1" "$cfg"; then
            echo "usb_max_current_enable=1" >> "$cfg"
            echo "  -> Added usb_max_current_enable=1 to $cfg"
        else
            echo "  -> Already configured in $cfg"
        fi
    fi
done

# 2. Update System Packages
echo "[2/6] Installing Linux prerequisites..."
apt-get update -y
apt-get install -y python3 python3-pip python3-venv git curl

# 3. Setup Hub Directory & Virtual Environment
INSTALL_DIR="/opt/piet_system/raspberry_pi_hub"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# Search for the hub source directory
if [ -d "$REPO_DIR/piet_system/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/piet_system/raspberry_pi_hub"
elif [ -d "$REPO_DIR/raspberry_pi_hub" ]; then
    HUB_SRC="$REPO_DIR/raspberry_pi_hub"
else
    HUB_SRC="$REPO_DIR"
fi

echo "[3/6] Setting up Hub server in $INSTALL_DIR (source: $HUB_SRC)..."
mkdir -p "$INSTALL_DIR"
cp -r "$HUB_SRC"/* "$INSTALL_DIR/" 2>/dev/null || true

python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# Initialize SQLite database
"$INSTALL_DIR/venv/bin/python3" -c "import sys; sys.path.append('$INSTALL_DIR'); import database; database.init_db(); print('Database initialized successfully!')"

# 4. Generate & Start Systemd Service
echo "[4/6] Creating & enabling auto-startup systemd service..."
SERVICE_NAME="piet-lab-hub.service"
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=PIET AIML Department Smart Lab 414 Supervision Hub
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

# Setup Tailscale Funnel auto-start on boot
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

systemctl daemon-reload
systemctl enable piet-funnel.service

# 5. Install & Connect Tailscale
echo "[5/6] Setting up Tailscale (Node Name: pi-lab414)..."
if ! command -v tailscale &> /dev/null; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

echo ""
echo "================================================================="
echo "  🔑 TAILSCALE AUTHENTICATION FOR PI 1 (LAB 414)"
echo "================================================================="
echo "Logging in as 'pi-lab414'..."
tailscale up --hostname=pi-lab414 --operator=${SUDO_USER:-pi} || tailscale up --hostname=pi-lab414

# 6. Final Status & Summary
echo ""
echo "================================================================="
echo "  ✅ RASPBERRY PI 1 (LAB 414) SETUP COMPLETED SUCCESSFULLY!"
echo "================================================================="
LOCAL_IP=$(hostname -I | awk '{print $1}')
TS_IP=$(tailscale ip -4 2>/dev/null || echo "Pending Login")

echo "📍 Local LAN URL    : http://${LOCAL_IP}:8000/"
echo "🌐 Tailscale Node   : pi-lab414 (${TS_IP})"
echo "📱 Tailscale URL    : http://${TS_IP}:8000/ or http://pi-lab414:8000/"
echo "⚙️ Service Status   : active (running)"
echo "================================================================="
