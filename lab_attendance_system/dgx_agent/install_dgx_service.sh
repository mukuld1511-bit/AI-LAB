#!/bin/bash
# ==============================================================================
# setup.sh / install_dgx_service.sh — Universal 1-Click DGX Telemetry Service
# Designed for AI Lab DGX Stations & Linux Workstations (PC-1 to PC-8)
# ==============================================================================

set -e

# 0. Immediate DNS Auto-Heal & Static Host Mapping (Bypasses college DNS failure)
if [ -f /etc/resolv.conf ]; then
    if ! grep -q "^nameserver 8.8.8.8" /etc/resolv.conf 2>/dev/null; then
        echo "🔧 Fixing DNS: setting Google DNS (8.8.8.8) at top of /etc/resolv.conf..."
        sed -i '1i nameserver 8.8.8.8' /etc/resolv.conf 2>/dev/null || echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf 2>/dev/null || true
    fi
fi
if [ -f /etc/hosts ]; then
    if ! grep -q "labg418pc12.tailc8c1f6.ts.net" /etc/hosts 2>/dev/null; then
        echo "103.84.155.153 labg418pc12.tailc8c1f6.ts.net" >> /etc/hosts 2>/dev/null || true
    fi
fi

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

LAN_BACKEND="http://10.9.6.255:8000"
TS_BACKEND="https://labg418pc12.tailc8c1f6.ts.net"

# If user provided a specific backend as 2nd param, use it. Otherwise test LAN first.
if [ -n "$2" ]; then
    PRIMARY_BACKEND="$2"
    FALLBACK_BACKEND="$LAN_BACKEND"
else
    # Check if local LAN 10.9.6.255:8000 is directly reachable on Ethernet switch
    if curl -s --connect-timeout 2 "$LAN_BACKEND/api/pc/heartbeat" >/dev/null 2>&1 || curl -s --connect-timeout 2 "$LAN_BACKEND" >/dev/null 2>&1; then
        PRIMARY_BACKEND="$LAN_BACKEND"
        FALLBACK_BACKEND="$TS_BACKEND"
    else
        PRIMARY_BACKEND="$TS_BACKEND"
        FALLBACK_BACKEND="$LAN_BACKEND"
    fi
fi

INSTALL_DIR="/opt/ai_lab_agent"
SERVICE_NAME="ailab-telemetry.service"

echo "================================================================="
echo "  AI LAB DGX TELEMETRY AUTO-STARTUP & SELF-UPDATE SERVICE"
echo "================================================================="
echo "Target PC ID     : $PC_ID"
echo "Primary Backend  : $PRIMARY_BACKEND"
echo "Fallback Backend : $FALLBACK_BACKEND"
echo "Install Dir      : $INSTALL_DIR"
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

# 2. Multi-Source Resilient Download of Python Telemetry Agent
mkdir -p "$INSTALL_DIR"
echo "📥 Fetching latest telemetry agent for $PC_ID..."

DOWNLOAD_SUCCESS=0
DOWNLOAD_SOURCES=(
    "$PRIMARY_BACKEND/dgx_agent/dgx_telemetry_agent.py"
    "$FALLBACK_BACKEND/dgx_agent/dgx_telemetry_agent.py"
    "http://10.9.6.255:8000/dgx_agent/dgx_telemetry_agent.py"
    "https://labg418pc12.tailc8c1f6.ts.net/dgx_agent/dgx_telemetry_agent.py"
    "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/dgx_telemetry_agent.py"
)

for SRC_URL in "${DOWNLOAD_SOURCES[@]}"; do
    if curl -sSL --connect-timeout 6 "$SRC_URL" -o "$INSTALL_DIR/dgx_telemetry_agent.py" 2>/dev/null && [ -s "$INSTALL_DIR/dgx_telemetry_agent.py" ]; then
        if grep -q "dgx_telemetry_agent.py" "$INSTALL_DIR/dgx_telemetry_agent.py"; then
            echo "✅ Successfully fetched agent code from: $SRC_URL"
            DOWNLOAD_SUCCESS=1
            break
        fi
    fi
done

if [ "$DOWNLOAD_SUCCESS" -eq 0 ]; then
    echo "❌ Failed to fetch telemetry agent from all sources. Please check network connectivity."
    exit 1
fi

chmod +x "$INSTALL_DIR/dgx_telemetry_agent.py"

# 3. Generate Systemd Service (Dual-URL Auto-Failover Enabled)
cat <<EOF > /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=AI ML Lab DGX Telemetry & Heartbeat Daemon
After=network.target graphical.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$PYTHON_BIN $INSTALL_DIR/dgx_telemetry_agent.py --pc-id $PC_ID --url $PRIMARY_BACKEND --fallback-url $FALLBACK_BACKEND
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
