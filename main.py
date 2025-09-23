from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import BackgroundTasks
import subprocess
import asyncio
import socket
import psutil
import os
import configparser # NEW: For parsing .db_creds file

# NEW IMPORTS FOR SESSION MANAGEMENT
from starlette.middleware.sessions import SessionMiddleware

# Generate a secret key for session management (IMPORTANT: Change this in production!)
SESSION_SECRET_KEY = os.environ.get("SESSION_SECRET_KEY", "your-super-secret-key-that-you-should-change")
CRED_FILE_PATH = "/home/oracle/dba_scripts/.db_creds" # Path to your Oracle credentials file

# -------------------------
# Script path
# -------------------------
TABLESPACE_SCRIPT_PATH = "./scripts/tablespace_report.sh"  # Adjust shell script path here
INVALID_OBJECTS_SCRIPT_PATH = "./scripts/invalid_objects_report.sh"
# NEW SCRIPTS
CONCURRENT_MANAGERS_SCRIPT_PATH = "./scripts/concurrent_managers_report.sh"
WORKFLOW_MAILER_SCRIPT_PATH = "./scripts/workflow_mailer_report.sh"
TOP_SEGMENTS_SCRIPT_PATH = "./scripts/top_segments_report.sh"
CONCURRENT_HISTORY_SCRIPT_PATH = "./scripts/concurrent_history_report.sh"
DATABASE_BACKUP_SCRIPT_PATH = "./scripts/database_backup_report.sh"


# -------------------------
# App setup
# -------------------------
app = FastAPI()
REPORT_DIR = "./report"
os.makedirs(REPORT_DIR, exist_ok=True)
app.mount("/report", StaticFiles(directory=REPORT_DIR), name="report")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Add Session Middleware
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY)

# -------------------------
# Database setup
# -------------------------
Base = declarative_base()
engine = create_engine("sqlite:///./users.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

Base.metadata.create_all(bind=engine)

# -------------------------
# Auth utils
# -------------------------
SECRET_KEY = "CHANGE_THIS_TO_A_RANDOM_SECURE_KEY"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_ctx.verify(password, hashed)

def create_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_user(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
    except JWTError:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = get_user(db, username)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# -------------------------
# Pydantic Model (Simplified for login/register only)
# -------------------------
class AuthUserIn(BaseModel): # Renamed to avoid confusion with script params
    username: str
    password: str

# -------------------------
# Auth endpoints
# -------------------------
@app.post("/api/register")
def register(user_in: AuthUserIn, db: Session = Depends(get_db)):
    if get_user(db, user_in.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(username=user_in.username, hashed_password=hash_password(user_in.password))
    db.add(user)
    db.commit()
    return {"msg": "User created", "username": user.username}

@app.post("/api/token")
def login(user_in: AuthUserIn, db: Session = Depends(get_db)):
    user = get_user(db, user_in.username)
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token({"sub": user.username}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    response = JSONResponse({"msg": "Login successful"})
    response.set_cookie(key="access_token", value=token, httponly=True, samesite="lax")
    return response

@app.get("/logout")
def logout():
    response = RedirectResponse("/static/login.html")
    response.delete_cookie("access_token")
    return response

# -------------------------
# Oracle Credential Helper (Backend-side)
# -------------------------
def _get_oracle_credentials():
    # 1. Determine ORACLE_SID
    # Try environment variable
    sid = os.environ.get('ORACLE_SID')
    
    # Try /etc/oratab if env var not set
    if not sid and os.path.exists('/etc/oratab'):
        try:
            with open('/etc/oratab', 'r') as f:
                for line in f:
                    if not line.startswith('#') and line.strip():
                        sid = line.split(':')[0].strip()
                        if sid: break
        except Exception as e:
            print(f"Warning: Could not parse /etc/oratab: {e}")

    # Default if no SID found
    if not sid:
        sid = "DEV" # Default SID if none detected

    # 2. Read credentials from .db_creds file
    config = configparser.ConfigParser()
    try:
        config.read(CRED_FILE_PATH)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read credential file {CRED_FILE_PATH}: {e}")

    if sid not in config:
        raise HTTPException(status_code=500, detail=f"SID '{sid}' not found in {CRED_FILE_PATH}")

    # Default to 'system' user if not specified in config or for simplicity
    ora_user = config.get(sid, 'system_user', fallback='system') # Assuming 'system' is a common user
    ora_pass = config.get(sid, 'system_password', fallback=None) # Assuming password key is 'system_password'

    # You might want to get different users (sys, apps etc.)
    # For now, simplifying to just one primary user for reports
    # ora_pass = config.get(sid, 'sys', fallback=None) # For sys
    # ora_pass = config.get(sid, 'apps', fallback=None) # For apps

    if not ora_pass:
        raise HTTPException(status_code=500, detail=f"Password for user '{ora_user}' (or default 'system_password') under SID '{sid}' not found in {CRED_FILE_PATH}")

    return sid, ora_user, ora_pass

# -------------------------
# Dashboard
# -------------------------
@app.get("/", response_class=HTMLResponse)
async def home(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse("/static/login.html")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return RedirectResponse("/static/login.html")
    except JWTError:
        return RedirectResponse("/static/login.html")
    user = get_user(db, username)
    if not user:
        return RedirectResponse("/static/login.html")

    hostname = socket.gethostname()

    # Prepare reports dict with filenames and last modified time or None if not found
    report_buttons = [
        {"name": "OS mount Monitor", "file_prefix": "mount_report_"},
        {"name": "AD Preclone Report", "file_prefix": "adpreclone_"},
        {"name": "Daily Health Check", "file_prefix": "Daily_health_check_"},
        {"name": "Oracle Home Backup", "file_prefix": "Oracle_Home_Backup_"},
    ]
    latest_reports = {}
    # Scan for pre-existing files for all reports, including the new ones for initial state
    live_report_files = {
        "tablespace": "tablespace_report_",
        "invalid-objects": "invalid_objects_report_",
        "concurrent-managers": "concurrent_managers_report_",
        "workflow-mailer": "workflow_mailer_report_",
        "top-segments": "top_segments_report_",
        "concurrent-history": "concurrent_history_report_",
        "database-backup": "database_backup_report_",
    }

    for btn_type, prefix in live_report_files.items():
        latest_file = None
        latest_mtime = 0
        for f in os.listdir(REPORT_DIR):
            if f.startswith(prefix) and f.endswith(".html"):
                filepath = os.path.join(REPORT_DIR, f)
                mtime = os.path.getmtime(filepath)
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    latest_file = f

        if latest_file:
            latest_reports[btn_type] = {
                "filename": latest_file,
                "last_modified": datetime.fromtimestamp(latest_mtime).strftime("%Y-%m-%d %H:%M:%S")
            }
        else:
            latest_reports[btn_type] = None


    # Process legacy reports separately if needed, or integrate into the above
    # For now, keeping original report_buttons for the 'Reports' section
    legacy_reports_display = {}
    all_files = sorted(os.listdir(REPORT_DIR), reverse=True)
    for btn in report_buttons:
        for f in all_files:
            if btn["file_prefix"] in f:
                filepath = os.path.join(REPORT_DIR, f)
                mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                legacy_reports_display[btn["name"]] = {
                    "filename": f,
                    "last_modified": mtime.strftime("%Y-%m-%d %H:%M:%S")
                }
                break
        else:
            legacy_reports_display[btn["name"]] = None


    return templates.TemplateResponse(
        "index.html",
        {"request": request, "reports": legacy_reports_display, "live_reports_initial_state": latest_reports, "user": user.username, "hostname": hostname},
    )

@app.get("/download-report/{report_name}")
async def download_report(report_name: str, current_user: User = Depends(get_current_user)):
    report_path = os.path.join(REPORT_DIR, report_name)
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(report_path, media_type="text/html", filename=report_name)

@app.get("/api/system-stats")
async def system_stats():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    ram_percent = psutil.virtual_memory().percent
    return JSONResponse({"cpu": cpu_percent, "ram": ram_percent})

@app.get("/api/mount-usage")
async def mount_usage():
    partitions = psutil.disk_partitions(all=False)  # only real mount points
    usage_data = []
    for p in partitions:
        try:
            usage = psutil.disk_usage(p.mountpoint)
            usage_data.append({
                "mountpoint": p.mountpoint,
                "device": p.device,
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "percent_used": usage.percent
            })
        except PermissionError:
            # Ignore partitions we cannot access
            continue
    return JSONResponse(usage_data)

@app.get("/api/disk-io-rate")
async def disk_io_rate():
    io1 = psutil.disk_io_counters()
    await asyncio.sleep(1)
    io2 = psutil.disk_io_counters()
    read_rate = (io2.read_bytes - io1.read_bytes) / (1024 ** 2)  # MB/s
    write_rate = (io2.write_bytes - io1.write_bytes) / (1024 ** 2)  # MB/s
    return JSONResponse({
        "read_mb_per_s": round(read_rate, 2),
        "write_mb_per_s": round(write_rate, 2)
    })

@app.get("/api/network-io-rate")
async def network_io_rate():
    net1 = psutil.net_io_counters()
    await asyncio.sleep(1)
    net2 = psutil.net_io_counters()
    sent_rate = (net2.bytes_sent - net1.bytes_sent) / (1024 ** 2)  # MB/s
    recv_rate = (net2.bytes_recv - net1.bytes_recv) / (1024 ** 2)  # MB/s
    return JSONResponse({
        "sent_mb_per_s": round(sent_rate, 2),
        "recv_mb_per_s": round(recv_rate, 2)
    })

# --- Live Report Generation Endpoints ---
async def run_oracle_script_and_return_latest_filename(script_path: str, file_prefix: str):
    # Get Oracle credentials from server-side file
    sid, ora_user, ora_pass = _get_oracle_credentials()

    # Pass SID, Oracle User, Oracle Password, and Report_Dir to the shell script
    process = await asyncio.create_subprocess_exec(
        "bash", script_path, sid, ora_user, ora_pass, REPORT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        print(f"Script Error ({script_path}): {stderr.decode()}")
        raise HTTPException(status_code=500, detail=f"Script failed: {stderr.decode()}")
    
    # The script should print the generated filename to stdout
    generated_filename = stdout.decode().strip()
    
    if not generated_filename:
        raise HTTPException(status_code=500, detail="Script did not return a filename.")

    # Verify the file exists and get its modification time
    filepath = os.path.join(REPORT_DIR, generated_filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=500, detail=f"Generated report file not found: {generated_filename}")

    mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
    last_modified = mtime.strftime("%Y-%m-%d %H:%M:%S")

    return {"filename": generated_filename, "last_modified": last_modified}


@app.post("/api/run-tablespace-report")
async def run_tablespace_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        TABLESPACE_SCRIPT_PATH, "tablespace_report_"
    )

@app.post("/api/run-invalid-objects-report")
async def run_invalid_objects_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        INVALID_OBJECTS_SCRIPT_PATH, "invalid_objects_report_"
    )

# NEW ENDPOINTS FOR NEW REPORTS
@app.post("/api/run-concurrent-managers-report")
async def run_concurrent_managers_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        CONCURRENT_MANAGERS_SCRIPT_PATH, "concurrent_managers_report_"
    )

@app.post("/api/run-workflow-mailer-report")
async def run_workflow_mailer_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        WORKFLOW_MAILER_SCRIPT_PATH, "workflow_mailer_report_"
    )

@app.post("/api/run-top-segments-report")
async def run_top_segments_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        TOP_SEGMENTS_SCRIPT_PATH, "top_segments_report_"
    )

@app.post("/api/run-concurrent-history-report")
async def run_concurrent_history_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        CONCURRENT_HISTORY_SCRIPT_PATH, "concurrent_history_report_"
    )

@app.post("/api/run-database-backup-report")
async def run_database_backup_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        DATABASE_BACKUP_SCRIPT_PATH, "database_backup_report_"
    )
