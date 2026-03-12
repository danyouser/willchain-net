#!/usr/bin/env bash
# WillChain VPS Monitor — runs every 5 minutes via cron
# Sends Telegram alerts on state changes (OK↔FAIL)
#
# Config: /opt/willchain-net/scripts/monitor.env (not in git)
#   MONITOR_TG_TOKEN=<bot token>
#   MONITOR_TG_CHAT=<chat_id>
#
# Install:
#   crontab -e
#   */5 * * * * /opt/willchain-net/scripts/monitor.sh 2>&1 | logger -t willchain-monitor

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/monitor.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Create it with MONITOR_TG_TOKEN and MONITOR_TG_CHAT."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

if [[ -z "${MONITOR_TG_TOKEN:-}" || -z "${MONITOR_TG_CHAT:-}" ]]; then
  echo "ERROR: MONITOR_TG_TOKEN and MONITOR_TG_CHAT must be set in ${ENV_FILE}"
  exit 1
fi

STATE_FILE="/tmp/willchain-monitor-state"
HOSTNAME=$(hostname)

# ---------- helpers ----------

send_alert() {
  local text="$1"
  curl -sf -X POST "https://api.telegram.org/bot${MONITOR_TG_TOKEN}/sendMessage" \
    -d chat_id="${MONITOR_TG_CHAT}" \
    -d parse_mode=HTML \
    -d text="${text}" >/dev/null 2>&1 || true
}

# Load previous state into associative array
declare -A PREV_STATE
if [[ -f "$STATE_FILE" ]]; then
  while IFS='=' read -r key val; do
    [[ -n "$key" ]] && PREV_STATE["$key"]="$val"
  done < "$STATE_FILE"
fi

declare -A CURR_STATE

check() {
  local name="$1" status="$2" detail="${3:-}"
  CURR_STATE["$name"]="$status"
  local prev="${PREV_STATE[$name]:-UNKNOWN}"

  if [[ "$prev" != "$status" ]]; then
    if [[ "$status" == "FAIL" ]]; then
      send_alert "🔴 <b>${name}</b> FAIL on ${HOSTNAME}
${detail}"
    elif [[ "$prev" != "UNKNOWN" ]]; then
      send_alert "🟢 <b>${name}</b> recovered on ${HOSTNAME}"
    fi
  fi
}

# ---------- checks ----------

# 1. Bot service
bot_status=$(systemctl is-active willchain-bot 2>/dev/null || echo "inactive")
if [[ "$bot_status" == "active" ]]; then
  check "bot-service" "OK"
else
  check "bot-service" "FAIL" "systemctl status: ${bot_status}"
fi

# 2-4. API health (bot health, RPC, event lag)
health_json=$(curl -sf --max-time 10 http://localhost:3001/health 2>/dev/null || echo "")
if [[ -z "$health_json" ]]; then
  check "api-health" "FAIL" "HTTP request failed or timed out"
  check "rpc" "FAIL" "cannot check — API unreachable"
  check "event-lag" "FAIL" "cannot check — API unreachable"
else
  # Parse with grep — no jq dependency needed
  api_ok=$(echo "$health_json" | grep -o '"ok":[a-z]*' | head -1 | cut -d: -f2)
  rpc_ok=$(echo "$health_json" | grep -o '"rpc":[a-z]*' | head -1 | cut -d: -f2)
  lag_alert=$(echo "$health_json" | grep -o '"blockLagAlert":[a-z]*' | head -1 | cut -d: -f2)

  if [[ "$api_ok" == "true" ]]; then
    check "api-health" "OK"
  else
    check "api-health" "FAIL" "ok=${api_ok}"
  fi

  if [[ "$rpc_ok" == "true" ]]; then
    check "rpc" "OK"
  else
    check "rpc" "FAIL" "RPC provider not responding"
  fi

  if [[ "$lag_alert" == "true" ]]; then
    check "event-lag" "FAIL" "No new blocks for >10 minutes"
  else
    check "event-lag" "OK"
  fi
fi

# 5. Disk usage
disk_pct=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')
if (( disk_pct > 90 )); then
  check "disk" "FAIL" "Usage: ${disk_pct}%"
else
  check "disk" "OK"
fi

# 6. RAM usage
ram_pct=$(free | awk '/Mem:/{printf "%.0f", $3/$2*100}')
if (( ram_pct > 90 )); then
  check "ram" "FAIL" "Usage: ${ram_pct}%"
else
  check "ram" "OK"
fi

# 7. nginx
nginx_status=$(systemctl is-active nginx 2>/dev/null || echo "inactive")
if [[ "$nginx_status" == "active" ]]; then
  check "nginx" "OK"
else
  check "nginx" "FAIL" "systemctl status: ${nginx_status}"
fi

# 8. SSL certificate expiry (<7 days)
cert_file="/etc/nginx/ssl/willchain.crt"
if [[ -f "$cert_file" ]]; then
  expiry_epoch=$(date -d "$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
  if (( days_left < 7 )); then
    check "ssl-cert" "FAIL" "Expires in ${days_left} days"
  else
    check "ssl-cert" "OK"
  fi
else
  check "ssl-cert" "FAIL" "Certificate file not found: ${cert_file}"
fi

# ---------- save state ----------

: > "$STATE_FILE"
for key in "${!CURR_STATE[@]}"; do
  echo "${key}=${CURR_STATE[$key]}" >> "$STATE_FILE"
done
