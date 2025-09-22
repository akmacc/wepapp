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

# -------------------------
# Script path
# -------------------------
TABLESPACE_SCRIPT_PATH = "./scripts/tablespace_report.sh"  # Adjust shell script path here

# -------------------------
# App setup
# -------------------------
app = FastAPI()
REPORT_DIR = "./report"
os.makedirs(REPORT_DIR, exist_ok=True)
app.mount("/report", StaticFiles(directory=REPORT_DIR), name="report")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

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
# Pydantic Model
# -------------------------
class UserIn(BaseModel):
    username: str
    password: str

# -------------------------
# Auth endpoints
# -------------------------
@app.post("/api/register")
def register(user_in: UserIn, db: Session = Depends(get_db)):
    if get_user(db, user_in.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(username=user_in.username, hashed_password=hash_password(user_in.password))
    db.add(user)
    db.commit()
    return {"msg": "User created", "username": user.username}

@app.post("/api/token")
def login(user_in: UserIn, db: Session = Depends(get_db)):
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
    all_files = sorted(os.listdir(REPORT_DIR), reverse=True)
    for btn in report_buttons:
        for f in all_files:
            if btn["file_prefix"] in f:
                filepath = os.path.join(REPORT_DIR, f)
                mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                latest_reports[btn["name"]] = {
                    "filename": f,
                    "last_modified": mtime.strftime("%Y-%m-%d %H:%M:%S")
                }
                break
        else:
            latest_reports[btn["name"]] = None

    return templates.TemplateResponse(
        "index.html",
        {"request": request, "reports": latest_reports, "user": user.username, "hostname": hostname},
    )

@app.get("/download-report/{report_name}")
async def download_report(report_name: str, current_user: User = Depends(get_current_user)):
    report_path = os.path.join(REPORT_DIR, report_name)
    if not os.path.exists(report_path):
        return JSONResponse({"status": "Report not found"}, status_code=404)
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

@app.get("/logout")
def logout():
    response = RedirectResponse("/static/login.html")
    response.delete_cookie("access_token")
    return response

@app.post("/api/run-tablespace-report")
async def run_tablespace_report(background_tasks: BackgroundTasks):
    # Run shell script asynchronously
    def run_script():
        subprocess.run([TABLESPACE_SCRIPT_PATH], check=True)

    background_tasks.add_task(run_script)

    # Assume your shell script outputs HTML report to REPORT_DIR with timestamped filename
    # Get latest tablespace report file after running script (simplified here - ideally wait for completion)
    latest_file = None
    latest_mtime = None
    for fname in os.listdir(REPORT_DIR):
        if fname.startswith("tablespace_report_") and fname.endswith(".html"):
            fpath = os.path.join(REPORT_DIR, fname)
            mtime = os.path.getmtime(fpath)
            if latest_mtime is None or mtime > latest_mtime:
                latest_file = fname
                latest_mtime = mtime

    if latest_file is None:
        return JSONResponse({"error": "Report not found after running script"}, status_code=404)

    last_modified = datetime.fromtimestamp(latest_mtime).strftime("%Y-%m-%d %H:%M:%S")

    return {"filename": latest_file, "last_modified": last_modified}
