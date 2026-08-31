#!/usr/bin/env bash
# ============================================================
#  UAV Digital Twin — Full System Launcher
#  Usage: ./run.sh          (from UAV_Digital_Twin root)
# ============================================================

PYTHON=/home/rishi/anaconda3/bin/python
ROOT="$(cd "$(dirname "$0")" && pwd)"
SIM_SRC="$ROOT/simulator/ecu_sim.c"
SIM_BIN="$ROOT/simulator/ecu_sim"

# Colours
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; exit 1; }
hdr()  { echo -e "\n${BOLD}${CYAN}[$1]${NC} $2"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     UAV DIGITAL TWIN — SYSTEM LAUNCHER      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Step 0: Kill any stale background processes ──────────────
pkill -9 -f "backend/inference.py" 2>/dev/null || true
pkill -9 -f "simulator/mission_sim.py" 2>/dev/null || true
pkill -9 -f "simulator/ecu_sim" 2>/dev/null || true

# ── Step 1: MQTT Broker ──────────────────────────────────────
hdr "1/5" "MQTT Broker (Mosquitto)"
if systemctl is-active --quiet mosquitto 2>/dev/null; then
    ok "Mosquitto already running"
else
    echo "  → Starting Mosquitto..."
    sudo systemctl start mosquitto 2>/dev/null || {
        # Try running directly as fallback
        mosquitto -d 2>/dev/null && ok "Mosquitto started (direct)" \
            || fail "Cannot start Mosquitto. Run: sudo systemctl start mosquitto"
    }
    sleep 1
    ok "Mosquitto started"
fi

# ── Step 2: Build C simulator ────────────────────────────────
hdr "2/5" "ECU Simulator (C)"
if [ ! -f "$SIM_BIN" ] || [ "$SIM_SRC" -nt "$SIM_BIN" ]; then
    echo "  → Compiling ecu_sim.c..."
    gcc "$SIM_SRC" -o "$SIM_BIN" -lpaho-mqtt3c -lm \
        && ok "Build successful" \
        || fail "Compilation failed. Check gcc and paho-mqtt3c are installed."
else
    ok "Binary up-to-date (skip compile)"
fi

# ── Step 3: Train anomaly detector (first run only) ──────────
hdr "3/5" "Anomaly Detector"
if [ ! -f "$ROOT/backend/anomaly_model.pkl" ]; then
    warn "No anomaly model found — training now (one-time, ~60s)..."
    $PYTHON "$ROOT/backend/train_anomaly_detector.py" \
        && ok "Anomaly model trained and saved" \
        || fail "Anomaly detector training failed"
else
    ok "Anomaly model already exists (skip training)"
fi

# ── Step 4: Start inference engine ───────────────────────────
hdr "4/5" "AI Inference Engine"
echo "  → Launching backend/inference.py..."
cd "$ROOT"
$PYTHON "$ROOT/backend/inference.py" &
INFERENCE_PID=$!

# Wait for WebSocket server to be ready (max 15s)
echo "  → Waiting for model load..."
for i in $(seq 1 15); do
    sleep 1
    if kill -0 $INFERENCE_PID 2>/dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ':8765' || \
           netstat -tlnp 2>/dev/null | grep -q ':8765'; then
            ok "Inference engine live (PID $INFERENCE_PID)"
            break
        fi
    else
        fail "Inference engine crashed. Check: $ROOT/backend/inference.py"
    fi
    if [ $i -eq 15 ]; then
        ok "Inference engine running (PID $INFERENCE_PID)"
    fi
done

# ── Step 5: Start Mission Simulator ──────────────────────────
hdr "5/5" "Mission Simulator (Python)"
echo "  → Launching mission_sim.py (hot-reloadable profiles)..."
$PYTHON "$ROOT/simulator/mission_sim.py" &
SIM_PID=$!
sleep 1
if kill -0 $SIM_PID 2>/dev/null; then
    ok "Mission simulator live (PID $SIM_PID)"
else
    fail "Mission simulator failed to start."
fi

# ── Ready ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║           ALL SYSTEMS LIVE ✓                 ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║  Dashboard  →  open frontend/index.html      ║${NC}"
echo -e "${BOLD}${GREEN}║  WebSocket  →  ws://localhost:8765            ║${NC}"
echo -e "${BOLD}${GREEN}║  MQTT       →  localhost:1883                 ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to shut down all services.${NC}"
echo ""

# ── Graceful shutdown ────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down all UAV Twin services...${NC}"
    kill $INFERENCE_PID 2>/dev/null || true
    kill $SIM_PID 2>/dev/null || true
    pkill -9 -f "backend/inference.py" 2>/dev/null || true
    pkill -9 -f "simulator/mission_sim.py" 2>/dev/null || true
    pkill -9 -f "simulator/ecu_sim" 2>/dev/null || true
    echo -e "${GREEN}All services stopped cleanly. Goodbye.${NC}"
    exit 0
}
trap cleanup INT TERM

# Wait on background processes
wait $INFERENCE_PID $SIM_PID
