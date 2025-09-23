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

# NEW IMPORTS FOR SESSION MANAGEMENT
from starlette.middleware.sessions import SessionMiddleware

# Generate a secret key for session management (IMPORTANT: Change this in production!)
SESSION_SECRET_KEY = os.environ.get("SESSION_SECRET_KEY", "your-super-secret-key-that-you-should-change")


# -------------------------
# Script path & FIXED FILENAMES
# -------------------------
# Define paths to scripts
TABLESPACE_SCRIPT_PATH = "./scripts/tablespace_report.sh"
INVALID_OBJECTS_SCRIPT_PATH = "./scripts/invalid_objects_report.sh"
CONCURRENT_MANAGERS_SCRIPT_PATH = "./scripts/concurrent_managers_report.sh"
WORKFLOW_MAILER_SCRIPT_PATH = "./scripts/workflow_mailer_report.sh"
TOP_SEGMENTS_SCRIPT_PATH = "./scripts/top_segments_report.sh"
CONCURRENT_HISTORY_SCRIPT_PATH = "./scripts/concurrent_history_report.sh"
DATABASE_BACKUP_SCRIPT_PATH = "./scripts/database_backup_report.sh"

# Define the expected FIXED filenames that each script will generate
FIXED_REPORT_FILENAMES = {
    "tablespace": "tablespace_report.html",
    "invalid-objects": "invalid_objects_report.html",
    "concurrent-managers": "concurrent_managers_report.html",
    "workflow-mailer": "workflow_mailer_report.html",
    "top-segments": "top_segments_report.html",
    "concurrent-history": "concurrent_history_report.html",
    "database-backup": "database_backup_report.html",
    # Add other legacy reports here if they also use fixed names and you want to track them this way
}

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
# Pydantic Model (for login/register only)
# -------------------------
class AuthUserIn(BaseModel):
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
        if username == None:
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
    
    # Use FIXED_REPORT_FILENAMES to check for existing reports
    for btn_type, fixed_filename in FIXED_REPORT_FILENAMES.items():
        filepath = os.path.join(REPORT_DIR, fixed_filename)
        if os.path.exists(filepath):
            mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
            latest_reports[btn_type] = {
                "filename": fixed_filename, # Store the fixed filename
                "last_modified": mtime.strftime("%Y-%m-%d %H:%M:%S")
            }
        else:
            latest_reports[btn_type] = None


    # Process legacy reports separately if needed, or integrate into the above
    # For now, keeping original report_buttons for the 'Reports' section
    legacy_reports_display = {}
    all_files = sorted(os.listdir(REPORT_DIR), reverse=True) # This will still pick up old timestamped files
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
async def run_oracle_script_and_return_latest_filename(script_path: str, report_type_key: str):
    # The shell script is now responsible for determining SID and credentials.
    # It will overwrite a FIXED filename.
    # We must know the expected fixed filename here.
    expected_fixed_filename = FIXED_REPORT_FILENAMES.get(report_type_key)
    if not expected_fixed_filename:
        raise HTTPException(status_code=500, detail=f"Fixed filename for report type '{report_type_key}' not defined.")

    process = await asyncio.create_subprocess_exec(
        "bash", script_path, REPORT_DIR, # Pass REPORT_DIR as the first argument
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        script_error_output = stderr.decode().strip()
        print(f"Script Error ({script_path}): {script_error_output}")
        raise HTTPException(status_code=500, detail=f"Script failed: {script_error_output}")
    
    # Shell script should now output the FIXED filename.
    returned_filename_from_script = stdout.decode().strip()
    
    # Verify that the script returned the expected fixed filename (or at least *a* filename)
    if not returned_filename_from_script:
        raise HTTPException(status_code=500, detail="Script did not return a filename.")
    
    # If the script returned a timestamped name by mistake, we should use the expected fixed one.
    # If the script returns the fixed name, this will be true.
    if returned_filename_from_script != expected_fixed_filename:
        print(f"Warning: Script {script_path} returned '{returned_filename_from_script}', but expected '{expected_fixed_filename}'. Using expected fixed filename.")
        effective_filename = expected_fixed_filename
    else:
        effective_filename = expected_fixed_filename


    # Now check the modification time of this fixed file
    filepath = os.path.join(REPORT_DIR, effective_filename)
    if not os.path.exists(filepath):
        # This error is critical - script claimed to make a file but it's not there
        raise HTTPException(status_code=500, detail=f"Generated report file '{effective_filename}' not found at expected path '{filepath}' after script execution.")

    mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
    last_modified = mtime.strftime("%Y-%m-%d %H:%M:%S")

    return {"filename": effective_filename, "last_modified": last_modified}


@app.post("/api/run-tablespace-report")
async def run_tablespace_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        TABLESPACE_SCRIPT_PATH, "tablespace" # Pass the key for FIXED_REPORT_FILENAMES
    )

@app.post("/api/run-invalid-objects-report")
async def run_invalid_objects_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        INVALID_OBJECTS_SCRIPT_PATH, "invalid-objects"
    )

@app.post("/api/run-concurrent-managers-report")
async def run_concurrent_managers_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        CONCURRENT_MANAGERS_SCRIPT_PATH, "concurrent-managers"
    )

@app.post("/api/run-workflow-mailer-report")
async def run_workflow_mailer_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        WORKFLOW_MAILER_SCRIPT_PATH, "workflow-mailer"
    )

@app.post("/api/run-top-segments-report")
async def run_top_segments_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        TOP_SEGMENTS_SCRIPT_PATH, "top-segments"
    )

@app.post("/api/run-concurrent-history-report")
async def run_concurrent_history_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        CONCURRENT_HISTORY_SCRIPT_PATH, "concurrent-history"
    )

@app.post("/api/run-database-backup-report")
async def run_database_backup_report_api(background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    return await run_oracle_script_and_return_latest_filename(
        DATABASE_BACKUP_SCRIPT_PATH, "database-backup"
    )
