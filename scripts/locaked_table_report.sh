#!/bin/bash
###############################################################################
# Script Name : tablespace_report.sh
# Description : Generates an HTML report for Tablespace Status.
# Author      : Guna Ak
# Created On  : 2025-09-23
# Version     : 1.10 (Direct HTML table generation from SQL*Plus variables)
###############################################################################

# Usage:
#   ./tablespace_report.sh [output_dir]
#   This script now sources its own environment and fetches credentials.

# User modifications
CRED_FILE="/home/oracle/dba_scripts/.db_creds"
# Path to your Oracle database environment file
ORACLE_ENV_FILE="/u01/install/APPS/19.0.0/EBSCDB_db.env"

# Parameter processing: OUTPUT_DIR is now the first argument
OUTPUT_DIR=${1:-"./report"} # Default to ./report if not provided

# --- Credential Fetching Function ---
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

# --- Source Oracle Environment ---
if [[ -f "$ORACLE_ENV_FILE" ]]; then
  source "$ORACLE_ENV_FILE"
else
  echo "ERROR: Oracle environment file not found at $ORACLE_ENV_FILE" >&2
  exit 1
fi

# ORACLE_SID should now be set by the sourced environment file.
if [[ -z "$ORACLE_SID" ]]; then
  echo "ERROR: ORACLE_SID not set after sourcing $ORACLE_ENV_FILE" >&2
  exit 1
fi

# Fetch Oracle 'system' user credentials for the detected ORACLE_SID
ORA_USER="system" # Assuming 'system' user for these reports
ORA_PASS=$(get_pass "$ORACLE_SID" "system_password") # Key from .db_creds, expecting 'system_password'

if [[ -z "$ORA_PASS" ]]; then
  echo "ERROR: Password for Oracle user '$ORA_USER' (key 'system_password') under SID '$ORACLE_SID' not found in $CRED_FILE" >&2
  exit 1
fi

TODAY=$(date '+%Y-%m-%d_%H-%M-%S')
REPORT_FILENAME="locked_table_report.html" # Fixed filename
OUTFILE="${OUTPUT_DIR}/${REPORT_FILENAME}"

mkdir -p "$OUTPUT_DIR"

sqlplus -s "${ORA_USER}/${ORA_PASS}@${ORACLE_SID}" <<EOF
alter session set container="EBSDB";
set feedback off
set pagesize 200
set linesize 200

-- Enable HTML Markup (ENTMAP OFF so HTML tags pass through)
set markup html on spool on entmap off preformat off                                           \
  head "<title>Oracle Database Health Report</title>                                           \
        <style>                                                                                \
          body  {background:#fdfdfd;font-family:Arial,sans-serif;color:#222;}                 \
          h1,h2 {color:#2c3e50;text-align:center;margin:20px 0 10px;}                         \
          table {border-collapse:collapse;width:95%;margin:12px auto;box-shadow:0 2px 6px #ccc;} \
          th,td {border:1px solid #888;padding:6px 12px;font-size:13px;}                      \
          th    {background:#34495e;color:#fff;text-align:left;}                              \
          tr:nth-child(even){background:#f9f9f9;}                                             \
          tr:hover {background:#f1f1f1;}                                                       \
          .warn {background:#f39c12;color:#fff;font-weight:bold;}                             \
          .crit {background:#e74c3c;color:#fff;font-weight:bold;}                             \
          .ok   {background:#27ae60;color:#fff;font-weight:bold;}                             \
        </style>"                                                                              \
  table "border='1' width='95%'"

spool $OUTFILE

col session_id head 'Sid' form 9999
col object_name head "Table|Locked" form a30
col oracle_username head "Oracle|Username" form a10 truncate 
col os_user_name head "OS|Username" form a10 truncate 
col process head "Client|Process|ID" form 99999999
col owner head "Table|Owner" form a10
col mode_held form a15
select lo.session_id,lo.oracle_username,lo.os_user_name,
lo.process,do.object_name,do.owner,
decode(lo.locked_mode,0, 'None',1, 'Null',2, 'Row Share (SS)',
3, 'Row Excl (SX)',4, 'Share',5, 'Share Row Excl (SSX)',6, 'Exclusive',
to_char(lo.locked_mode)) mode_held
from gv$locked_object lo, dba_objects do
where lo.object_id = do.object_id
order by 5
/

spool off
EOF
# Script must echo the FIXED filename to stdout
echo "${REPORT_FILENAME}"
