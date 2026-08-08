#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REMOTE_HOST="113.141.93.191"
REMOTE_USER="root"
REMOTE_DIR="/www/wwwroot/www.spiraxsarcocn.com"
DEPLOY_RUNTIME_MANAGER="bt-manual"
DEPLOY_PORT="4445"
BT_RESTART_COMMAND=""
MAX_SQLITE_BACKUPS="10"
BUILD_STATIC_ON_DEPLOY="0"
DEPLOY_UPLOAD_DB="0"
LOCAL_SQLITE_DB_PATH="${PROJECT_ROOT}/data/site.sqlite"
HEALTH_CHECK_URL="http://www.spiraxsarcocn.com"

KEY_FILE="$(mktemp "${TMPDIR:-/tmp}/spiraxsarcocn-deploy-key.XXXXXX")"
KNOWN_HOSTS_FILE="$(mktemp "${TMPDIR:-/tmp}/spiraxsarcocn-known-hosts.XXXXXX")"
LOCAL_DB_ARCHIVE_FILE=""
LOCAL_DB_SNAPSHOT_FILE=""

cleanup() {
  rm -f "${KEY_FILE}" "${KNOWN_HOSTS_FILE}"
  [ -z "${LOCAL_DB_ARCHIVE_FILE}" ] || rm -f "${LOCAL_DB_ARCHIVE_FILE}"
  [ -z "${LOCAL_DB_SNAPSHOT_FILE}" ] || rm -f "${LOCAL_DB_SNAPSHOT_FILE}"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '缺少必需命令：%s\n' "$1" >&2
    exit 1
  fi
}

print_usage() {
  cat <<EOF
用法：./scripts/deploy.sh [选项]

选项：
  --data                         gzip 压缩并上传本地 sqlite 数据库，覆盖远端数据库
  --build-site                   部署后在远端执行静态生成
  --db-path <path>               本地 sqlite 数据库路径
  --host <host>                  远端主机，默认：${REMOTE_HOST}
  --user <user>                  远端用户，默认：${REMOTE_USER}
  --dir <dir>                    远端应用目录，默认：${REMOTE_DIR}
  --runtime-manager <mode>       运行管理模式：bt、bt-manual、plain。默认：${DEPLOY_RUNTIME_MANAGER}
  --port <port>                  Node 服务端口，默认：${DEPLOY_PORT}
  --bt-restart-command <cmd>     runtime-manager 为 bt 时使用的重启命令
  --max-sqlite-backups <count>   远端 sqlite 备份保留数量，默认：${MAX_SQLITE_BACKUPS}
  --health-url <url>             健康检查基础 URL，默认：${HEALTH_CHECK_URL}
  --help                         显示此帮助信息
EOF
}

require_value() {
  if [ "$#" -lt 2 ]; then
    printf '缺少 %s 的参数值\n' "$1" >&2
    exit 1
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --data) DEPLOY_UPLOAD_DB=1 ;;
      --build-site) BUILD_STATIC_ON_DEPLOY=1 ;;
      --db-path) require_value "$@"; LOCAL_SQLITE_DB_PATH="$2"; shift ;;
      --host) require_value "$@"; REMOTE_HOST="$2"; shift ;;
      --user) require_value "$@"; REMOTE_USER="$2"; shift ;;
      --dir) require_value "$@"; REMOTE_DIR="$2"; shift ;;
      --runtime-manager) require_value "$@"; DEPLOY_RUNTIME_MANAGER="$2"; shift ;;
      --port) require_value "$@"; DEPLOY_PORT="$2"; shift ;;
      --bt-restart-command) require_value "$@"; BT_RESTART_COMMAND="$2"; shift ;;
      --max-sqlite-backups) require_value "$@"; MAX_SQLITE_BACKUPS="$2"; shift ;;
      --health-url) require_value "$@"; HEALTH_CHECK_URL="$2"; shift ;;
      --help|-h) print_usage; exit 0 ;;
      *) printf '未知选项：%s\n\n' "$1" >&2; print_usage >&2; exit 1 ;;
    esac
    shift
  done

  case "${DEPLOY_RUNTIME_MANAGER}" in
    bt|bt-manual|plain) ;;
    *) printf '无效的运行管理模式：%s\n' "${DEPLOY_RUNTIME_MANAGER}" >&2; exit 1 ;;
  esac
  case "${MAX_SQLITE_BACKUPS}" in
    ''|*[!0-9]*) printf '备份保留数量必须是非负整数：%s\n' "${MAX_SQLITE_BACKUPS}" >&2; exit 1 ;;
  esac
  case "${DEPLOY_PORT}" in
    ''|*[!0-9]*) printf '服务端口必须是正整数：%s\n' "${DEPLOY_PORT}" >&2; exit 1 ;;
  esac
  if [ "${DEPLOY_PORT}" -lt 1 ] || [ "${DEPLOY_PORT}" -gt 65535 ]; then
    printf '服务端口超出有效范围：%s\n' "${DEPLOY_PORT}" >&2
    exit 1
  fi
}

prompt_private_key() {
  local line=""
  printf '请粘贴用于连接 %s@%s 的 SSH 私钥。\n' "${REMOTE_USER}" "${REMOTE_HOST}" >&2
  printf '读取到 END PRIVATE KEY 行后会自动结束输入。\n' >&2
  : > "${KEY_FILE}"
  while IFS= read -r line; do
    line="${line%$'\r'}"
    printf '%s\n' "${line}" >> "${KEY_FILE}"
    if [[ "${line}" == *"END "* && "${line}" == *"PRIVATE KEY"* ]]; then
      break
    fi
  done
  chmod 600 "${KEY_FILE}"
  if ! grep -Eq 'BEGIN .+PRIVATE KEY' "${KEY_FILE}" || ! grep -Eq 'END .+PRIVATE KEY' "${KEY_FILE}"; then
    printf '粘贴的内容看起来不是有效的 SSH 私钥。\n' >&2
    exit 1
  fi
  read -r -p '私钥已读取，按回车继续...' _ < /dev/tty
}

create_local_sqlite_archive() {
  local db_file="$1"
  local archive_file="$2"
  LOCAL_DB_SNAPSHOT_FILE="$(mktemp "${TMPDIR:-/tmp}/spiraxsarcocn-sqlite-snapshot.XXXXXX")"
  printf '[部署] 正在创建 sqlite 一致性快照...\n'
  sqlite3 "${db_file}" ".backup '${LOCAL_DB_SNAPSHOT_FILE}'"
  sqlite3 "${LOCAL_DB_SNAPSHOT_FILE}" 'PRAGMA quick_check;' | grep -qx 'ok'
  printf '[部署] 正在压缩 sqlite 快照...\n'
  gzip -c "${LOCAL_DB_SNAPSHOT_FILE}" > "${archive_file}"
}

main() {
  parse_args "$@"
  require_command npm
  require_command ssh
  require_command rsync

  printf '\n[部署] 正在构建 dist 发布包...\n'
  (cd "${PROJECT_ROOT}" && npm run build:dist)

  prompt_private_key

  if [ "${DEPLOY_UPLOAD_DB}" = "1" ]; then
    require_command gzip
    require_command sqlite3
    if [ ! -f "${LOCAL_SQLITE_DB_PATH}" ]; then
      printf '未找到本地 sqlite 数据库：%s\n' "${LOCAL_SQLITE_DB_PATH}" >&2
      exit 1
    fi
    LOCAL_DB_ARCHIVE_FILE="$(mktemp "${TMPDIR:-/tmp}/spiraxsarcocn-site-sqlite.XXXXXX.gz")"
    create_local_sqlite_archive "${LOCAL_SQLITE_DB_PATH}" "${LOCAL_DB_ARCHIVE_FILE}"
    if [ "${BUILD_STATIC_ON_DEPLOY}" != "1" ]; then
      printf '[部署] 警告：已上传数据库但未启用静态生成；远端 html/ 不会重新生成。\n'
    fi
  fi

  local ssh_options=(
    -i "${KEY_FILE}"
    -o StrictHostKeyChecking=accept-new
    -o UserKnownHostsFile="${KNOWN_HOSTS_FILE}"
    -o IdentitiesOnly=yes
  )

  printf '[部署] 正在确认远端目录存在...\n'
  ssh "${ssh_options[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p '${REMOTE_DIR}' '${REMOTE_DIR}/.deploy'"

  printf '[部署] 正在通过 rsync 同步 dist 发布包到 %s...\n' "${REMOTE_DIR}"
  rsync -az --delete \
    --rsh="ssh ${ssh_options[*]}" \
    --filter='P /.deploy/' \
    --filter='P /.deploy/***' \
    --filter='P /.updates/' \
    --filter='P /.updates/***' \
    --filter='P /.env' \
    --filter='P /.env.*' \
    --filter='P /data/' \
    --filter='P /data/***' \
    --filter='P /html/' \
    --filter='P /html/***' \
    --filter='P /html_*/' \
    --filter='P /html_*/***' \
    --filter='P /logs/' \
    --filter='P /logs/***' \
    --filter='P /uploads/' \
    --filter='P /uploads/***' \
    --filter='P /system/server/node_modules/' \
    --filter='P /system/server/node_modules/***' \
    "${PROJECT_ROOT}/dist/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

  if [ "${DEPLOY_UPLOAD_DB}" = "1" ]; then
    printf '[部署] 正在上传压缩后的 sqlite 数据库...\n'
    rsync -az --rsh="ssh ${ssh_options[*]}" \
      "${LOCAL_DB_ARCHIVE_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/.deploy/site.sqlite.gz"
  fi

  if [ "${BUILD_STATIC_ON_DEPLOY}" = "1" ]; then
    printf '[部署] 正在检查依赖并重新生成静态页面...\n'
  else
    printf '[部署] 正在检查依赖，本次不生成静态页面...\n'
  fi

  ssh "${ssh_options[@]}" "${REMOTE_USER}@${REMOTE_HOST}" \
    "DEPLOY_RUNTIME_MANAGER='${DEPLOY_RUNTIME_MANAGER}' DEPLOY_PORT='${DEPLOY_PORT}' BT_RESTART_COMMAND='${BT_RESTART_COMMAND}' MAX_SQLITE_BACKUPS='${MAX_SQLITE_BACKUPS}' BUILD_STATIC_ON_DEPLOY='${BUILD_STATIC_ON_DEPLOY}' DEPLOY_UPLOAD_DB='${DEPLOY_UPLOAD_DB}' HEALTH_CHECK_URL='${HEALTH_CHECK_URL}' bash -s -- '${REMOTE_DIR}'" <<'REMOTE_SCRIPT'
set -euo pipefail

APP_DIR="$1"
PID_FILE="${APP_DIR}/.deploy/server.pid"
LOG_FILE="${APP_DIR}/logs/server.log"
SQLITE_DB_FILE="${APP_DIR}/data/site.sqlite"
SQLITE_BACKUP_DIR="${APP_DIR}/data/backups"
UPLOADED_SQLITE_ARCHIVE_FILE="${APP_DIR}/.deploy/site.sqlite.gz"
SKIP_PRE_RESTART_SQLITE_BACKUP=0

terminate_app_processes_by_cwd() {
  local app_dir="$1" pid cwd killed=0
  while IFS= read -r pid; do
    [ -n "${pid}" ] && [ -d "/proc/${pid}" ] || continue
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    [ "${cwd}" = "${app_dir}" ] || continue
    kill "${pid}" 2>/dev/null || true
    killed=1
  done < <(pgrep -u www -f 'node server.mjs|npm run start' || true)
  [ "${killed}" -eq 0 ] || sleep 2
  while IFS= read -r pid; do
    [ -n "${pid}" ] && [ -d "/proc/${pid}" ] || continue
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    [ "${cwd}" = "${app_dir}" ] || continue
    kill -9 "${pid}" 2>/dev/null || true
  done < <(pgrep -u www -f 'node server.mjs|npm run start' || true)
}

prune_sqlite_backups() {
  local backup_dir="$1" limit="${MAX_SQLITE_BACKUPS:-10}" index=0 file
  while IFS= read -r file; do
    index=$((index + 1))
    [ "${index}" -le "${limit}" ] || rm -f "${file}"
  done < <(find "${backup_dir}" -maxdepth 1 -type f -name 'site-*.sqlite' | sort -r)
}

create_sqlite_backup() {
  local db_file="$1" backup_dir="$2" timestamp backup_file
  if [ ! -f "${db_file}" ]; then
    printf '[部署] 未找到 sqlite 数据库，跳过备份。\n'
    return 0
  fi
  mkdir -p "${backup_dir}"
  timestamp="$(date +%Y%m%d-%H%M%S)"
  backup_file="${backup_dir}/site-${timestamp}.sqlite"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${db_file}" ".backup '${backup_file}'"
  else
    cp -f "${db_file}" "${backup_file}"
  fi
  prune_sqlite_backups "${backup_dir}"
  printf '[部署] SQLite 备份已创建：%s\n' "${backup_file}"
}

restore_uploaded_sqlite_database() {
  local archive_file="$1" db_file="$2" backup_dir="$3" tmp_file
  if [ ! -f "${archive_file}" ]; then
    printf '[部署] 未找到已上传的 sqlite 压缩包：%s\n' "${archive_file}" >&2
    exit 1
  fi
  create_sqlite_backup "${db_file}" "${backup_dir}"
  tmp_file="${db_file}.upload.$$"
  gzip -dc "${archive_file}" > "${tmp_file}"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${tmp_file}" 'PRAGMA quick_check;' | grep -qx 'ok'
  fi
  mv -f "${tmp_file}" "${db_file}"
  rm -f "${db_file}-wal" "${db_file}-shm" "${archive_file}"
  SKIP_PRE_RESTART_SQLITE_BACKUP=1
  printf '[部署] 已恢复上传的 sqlite 数据库：%s\n' "${db_file}"
}

ensure_runtime_permissions() {
  local app_dir="$1" target_user="${2:-www}" target_group="${3:-www}" runtime_path application_path
  chown "${target_user}:${target_group}" "${app_dir}"
  chmod 775 "${app_dir}"
  for runtime_path in "${app_dir}/.deploy" "${app_dir}/.updates" "${app_dir}/logs" "${app_dir}/data" "${app_dir}/html" "${app_dir}/uploads"; do
    [ ! -e "${runtime_path}" ] || chown -R "${target_user}:${target_group}" "${runtime_path}"
    [ ! -e "${runtime_path}" ] || chmod -R u+rwX,g+rwX,o-rwx "${runtime_path}" 2>/dev/null || true
  done
  for application_path in "${app_dir}/server.mjs" "${app_dir}/package.json" "${app_dir}/DEPLOY.md" "${app_dir}/RELEASE.json" "${app_dir}/system" "${app_dir}/scripts"; do
    [ ! -e "${application_path}" ] || chown -R "${target_user}:${target_group}" "${application_path}"
    [ ! -e "${application_path}" ] || chmod -R u+rwX,g+rX,o-rX "${application_path}" 2>/dev/null || true
  done
}

run_health_checks() {
  local base_url="${HEALTH_CHECK_URL:-http://www.spiraxsarcocn.com}"
  if ! command -v curl >/dev/null 2>&1; then
    printf '[部署] 未找到 curl，跳过健康检查。\n'
    return 0
  fi
  printf '[部署] 正在对 %s 执行健康检查...\n' "${base_url}"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/"
  curl -fsS --max-time 15 -o /dev/null "${base_url}/admin/"
  printf '[部署] 健康检查通过：/ 和 /admin/\n'
}

run_static_generation_if_requested() {
  if [ "${BUILD_STATIC_ON_DEPLOY:-0}" = "1" ]; then
    npm run build:site
  else
    printf '[部署] 跳过静态页面生成，保留现有 html/。\n'
  fi
}

install_server_dependencies_if_needed() {
  local package_dir="${APP_DIR}/system/server"
  local stamp_file="${APP_DIR}/.deploy/server-deps.sha256" current_hash previous_hash
  current_hash="$(cd "${package_dir}" && { sha256sum package.json; sha256sum package-lock.json; } | sha256sum | awk '{print $1}')"
  previous_hash="$(cat "${stamp_file}" 2>/dev/null || true)"
  if [ "${current_hash}" = "${previous_hash}" ] && [ -d "${package_dir}/node_modules" ]; then
    printf '[部署] 服务端依赖未变化，跳过 npm ci。\n'
    return 0
  fi
  printf '[部署] 正在安装服务端依赖...\n'
  npm --prefix "${package_dir}" ci --omit=dev --legacy-peer-deps --no-audit --no-fund
  printf '%s\n' "${current_hash}" > "${stamp_file}"
}

start_app_as_www() {
  su -s /bin/bash www -c "
    set -euo pipefail
    cd \"${APP_DIR}\"
    if [ -f .env.production ]; then set -a; . ./.env.production; set +a; fi
    nohup env PORT=\"${DEPLOY_PORT:-4445}\" NODE_ENV=production npm run start >> \"${LOG_FILE}\" 2>&1 &
    echo \$! > \"${PID_FILE}\"
  "
  local new_pid
  new_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  sleep 2
  if [ -z "${new_pid}" ] || ! kill -0 "${new_pid}" 2>/dev/null; then
    printf '远端服务未能以 www 用户启动。请检查 %s\n' "${LOG_FILE}" >&2
    exit 1
  fi
  printf '部署完成。PID=%s\n' "${new_pid}"
  run_health_checks
}

mkdir -p "${APP_DIR}" "${APP_DIR}/.deploy" "${APP_DIR}/.updates" "${APP_DIR}/data" "${APP_DIR}/html" "${APP_DIR}/logs" "${APP_DIR}/uploads"
cd "${APP_DIR}"
if [ -f .env.production ]; then set -a; . ./.env.production; set +a; fi
install_server_dependencies_if_needed

if [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt" ]; then
  if [ "${DEPLOY_UPLOAD_DB:-0}" = "1" ]; then
    printf '[部署] 警告：bt 模式替换数据库时，面板管理的服务可能仍在运行。\n'
    restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  fi
  [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" = "1" ] || create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  run_static_generation_if_requested
  ensure_runtime_permissions "${APP_DIR}"
  if [ -n "${BT_RESTART_COMMAND:-}" ]; then
    bash -lc "${BT_RESTART_COMMAND}"
    run_health_checks
  else
    printf '[部署] 文件已更新；请在 BT 面板中重启 Node 项目。\n'
  fi
elif [ "${DEPLOY_RUNTIME_MANAGER:-bt-manual}" = "bt-manual" ]; then
  terminate_app_processes_by_cwd "${APP_DIR}"
  [ "${DEPLOY_UPLOAD_DB:-0}" != "1" ] || restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" = "1" ] || create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  run_static_generation_if_requested
  ensure_runtime_permissions "${APP_DIR}"
  start_app_as_www
else
  if [ -f "${PID_FILE}" ]; then
    OLD_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; then
      kill "${OLD_PID}" 2>/dev/null || true
      sleep 2
      kill -9 "${OLD_PID}" 2>/dev/null || true
    fi
  fi
  [ "${DEPLOY_UPLOAD_DB:-0}" != "1" ] || restore_uploaded_sqlite_database "${UPLOADED_SQLITE_ARCHIVE_FILE}" "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  [ "${SKIP_PRE_RESTART_SQLITE_BACKUP}" = "1" ] || create_sqlite_backup "${SQLITE_DB_FILE}" "${SQLITE_BACKUP_DIR}"
  run_static_generation_if_requested
  ensure_runtime_permissions "${APP_DIR}"
  nohup env PORT="${DEPLOY_PORT:-4445}" NODE_ENV=production npm start >> "${LOG_FILE}" 2>&1 &
  NEW_PID="$!"
  echo "${NEW_PID}" > "${PID_FILE}"
  sleep 2
  kill -0 "${NEW_PID}" 2>/dev/null || { printf '远端服务启动失败。请检查 %s\n' "${LOG_FILE}" >&2; exit 1; }
  printf '部署完成。PID=%s\n' "${NEW_PID}"
  run_health_checks
fi
REMOTE_SCRIPT

  printf '[部署] 完成。\n'
}

main "$@"
