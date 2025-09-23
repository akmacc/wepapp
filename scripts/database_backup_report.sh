#!/bin/bash
###############################################################################
# Script Name : database_backup_report.sh
# Description : Generates an HTML report for Database Backup Status.
# Author      : Guna Ak
# Created On  : 2025-09-23
# Version     : 1.1 (Credential fetching from .db_creds)
###############################################################################

# Usage:
#   ./database_backup_report.sh <SID_PDB> [output_dir]

# User modifications
CRED_FILE="/home/oracle/dba_scripts/.db_creds"

# Parameter processing
SID_PDB_ARG=${1}
OUTPUT_DIR=${2:-"./report"} # Default to ./report if not provided

# --- Credential Fetching Function (Copied from your original script) ---
get_pass() {
  local section="$1"
  local key="$2"
  if [[ ! -f "$CRED_FILE" ]]; then
    echo "ERROR: Credential file not found at $CRED_FILE" >&2
    exit 1
  fi
  awk -v section="[$section]" -v key="$key" '
    $0 == section {found=1; next}
    /^\[/ {found=0}
    found && $1 ~ "^"key"=" {
      split($0, a, "="); print a[2]; exit
    }
  ' "$CRED_FILE"
}

# --- Oracle SID Detection (Copied from your original script) ---
if [[ -z "$SID_PDB_ARG" ]]; then
  SID_PDB_ARG=$(grep -v '^#' /etc/oratab | grep -v '^$' | head -1 | cut -d: -f1)
fi
if [[ -z "$SID_PDB_ARG" ]]; then
  echo "ERROR: No Oracle SID found in /etc/oratab and none supplied." >&2
  exit 1
fi
export ORACLE_SID=$SID_PDB_ARG

# --- Oracle Environment Setup (Copied from your original script) ---
export ORAENV_ASK=NO
if command -v oraenv >/dev/null 2>&1; then
  . oraenv >/dev/null
else
  ORACLE_HOME=$(grep -v '^#' /etc/oratab | grep "^${ORACLE_SID}:" | head -1 | cut -d: -f2)
  if [[ -z "$ORACLE_HOME" ]]; then
    echo "ERROR: Could not determine ORACLE_HOME for SID=$ORACLE_SID" >&2
    exit 1
  fi
  export ORACLE_HOME
  PATH=$ORACLE_HOME/bin:$PATH
fi

# Fetch Oracle 'system' user credentials
ORA_USER="system" # Assuming 'system' user for these reports
ORA_PASS=$(get_pass "$ORACLE_SID" "system_password") # Key from .db_creds

if [[ -z "$ORA_PASS" ]]; then
  echo "ERROR: Password for Oracle user '$ORA_USER' under SID '$ORACLE_SID' not found in $CRED_FILE" >&2
  exit 1
fi

TODAY=$(date '+%Y-%m-%d_%H-%M-%S')
REPORT_FILENAME="database_backup_report_${ORACLE_SID}_${TODAY}.html"
OUTFILE="${OUTPUT_DIR}/${REPORT_FILENAME}"

mkdir -p "$OUTPUT_DIR"

sqlplus -s "${ORA_USER}/${ORA_PASS}@${ORACLE_SID}" <<EOF

set feedback off
set pagesize 200
set linesize 200

set markup html on spool on entmap off preformat off head "<title>Oracle Database Backup Status</title><style>body{font-family:Arial,sans-serif;background-color:#f5f2ff;color:#2d1a40;margin:20px;}.container{background-color:#fff;border-radius:15px;box-shadow:0 5px 20px rgba(0,0,0,0.05);padding:20px;margin:auto;max-width:95%;}h1,h2{color:#7f62ca;text-align:center;margin-bottom:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #d4d3ef;padding:10px;text-align:left;font-size:14px;}th{background-color:#7f62ca;color:#fff;}tr:nth-child(even){background-color:#f9f9f9;}tr:hover{background-color:#f1f1f1;}
.ok {background:#27ae60;color:#fff;font-weight:bold;}
.crit {background:#e74c3c;color:#fff;font-weight:bold;}
</style>" table "border='1' width='100%'"

spool ${OUTFILE}

PROMPT <div class="container">
PROMPT <h1>Database Backup Status for ${ORACLE_SID}</h1>
PROMPT <p>Report Generated On: $(date +"%d-%m-%Y %H:%M:%S")</p>

ALTER SESSION SET CONTAINER = CDB\$ROOT;
SELECT
    SESSION_KEY,
    INPUT_TYPE,
    STATUS,
    TO_CHAR(START_TIME, 'MM/DD/YY HH24:MI') AS start_time,
    TO_CHAR(END_TIME, 'MM/DD/YY HH24:MI') AS end_time,
    elapsed_seconds / 3600 AS hrs,
    CASE
      WHEN STATUS = 'COMPLETED' THEN '<span class="ok">COMPLETED</span>'
      ELSE '<span class="crit">' || STATUS || '</span>'
    END status_indicator
FROM
    V\$RMAN_BACKUP_JOB_DETAILS
WHERE
    START_TIME > SYSDATE - 7
ORDER BY
    SESSION_KEY;

PROMPT </div>
spool off
EXIT

EOF
echo "${REPORT_FILENAME}"
