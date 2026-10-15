"""
Civic Smart - Python Flask REST API Backend
PostgreSQL DBMS Integration for Municipal Grievance & OS Scheduling
Works with standard Python installations and embedded PostgreSQL/pgAdmin Python.
"""

import os
import secrets
import hmac
from functools import wraps
import sys
import json
import subprocess
import time
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, make_response, session, g
from werkzeug.security import check_password_hash

# Auto-add PostgreSQL bin directory to Windows PATH so libpq DLLs are found
if sys.platform == "win32":
    for v in ["18", "17", "16", "15", "14"]:
        pg_bin = rf"C:\Program Files\PostgreSQL\{v}\bin"
        if os.path.exists(pg_bin) and pg_bin not in os.environ.get("PATH", ""):
            os.environ["PATH"] = pg_bin + os.pathsep + os.environ.get("PATH", "")
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(pg_bin)
                except Exception:
                    pass

# Load .env file with built-in parser fallback if python-dotenv is not installed
def load_env_file():
    try:
        from dotenv import load_dotenv
        load_dotenv()
        return
    except ImportError:
        pass

    # Fallback parser
    for env_path in [".env", "../.env", os.path.join(os.path.dirname(__file__), "..", ".env"), os.path.join(os.path.dirname(__file__), ".env")]:
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
            break

load_env_file()

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCHEDULER_CPP = os.path.join(ROOT_DIR, "civic_os_engine.cpp")
SCHEDULER_EXE = os.path.join(ROOT_DIR, "civic_os_engine.exe" if sys.platform == "win32" else "civic_os_engine")
app = Flask(__name__, static_folder=ROOT_DIR, static_url_path="")
if os.getenv("FLASK_ENV") == "production" and not os.getenv("FLASK_SECRET_KEY"):
    raise RuntimeError("FLASK_SECRET_KEY must be configured in production.")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "local-development-key-change-before-sharing")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "0") == "1")
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
app.permanent_session_lifetime = timedelta(hours=8)

@app.before_request
def protect_cookie_authenticated_writes():
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"} or not session.get("user"):
        return None
    expected = session.get("csrf_token", "")
    supplied = request.headers.get("X-CSRF-Token", "")
    if not expected or not hmac.compare_digest(expected, supplied):
        return jsonify({"error": "Request verification failed. Refresh the page and try again.", "code": "CSRF_FAILED"}), 403
    return None

def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}

def internal_error(ok=False):
    app.logger.exception("Civic Smart API operation failed")
    body = {"error": "The request could not be completed. Check the backend log."}
    if ok:
        body["ok"] = False
    return jsonify(body), 500

@app.route("/")
def index():
    return app.send_static_file("index.html")

# Built-in CORS support
ALLOWED_ORIGINS = {"http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:5000", "http://127.0.0.1:5000"}
try:
    from flask_cors import CORS
    CORS(app, supports_credentials=True, origins=list(ALLOWED_ORIGINS))
except ImportError:
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers.add("Vary", "Origin")
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token"
        return response

    @app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
    @app.route("/<path:path>", methods=["OPTIONS"])
    def preflight_handler(path):
        resp = make_response()
        origin = request.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers.add("Vary", "Origin")
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token"
        return resp

PORT = int(os.getenv("PORT", 5000))
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", 5432))
PGDATABASE = os.getenv("PGDATABASE", "civic_smartdb")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = json_body()
    username = str(data.get("username", "")).strip()
    password = data.get("password", "")
    requested_role = str(data.get("role", "")).upper()
    if not username or len(username) > 100 or not isinstance(password, str) or not password:
        return jsonify({"error": "Username and password are required."}), 400
    if requested_role not in {"CITIZEN", "OFFICER", "ADMIN"}:
        return jsonify({"error": "Choose a valid portal role."}), 400
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """SELECT u.user_id, u.username, u.password_hash, u.role, u.citizen_id, u.officer_id
               FROM app_users u WHERE LOWER(u.username) = LOWER(%s) AND u.role = %s AND u.is_active = TRUE
                 AND (u.role = 'ADMIN'
                      OR (u.role = 'CITIZEN' AND EXISTS (SELECT 1 FROM citizens c WHERE c.citizen_id = u.citizen_id AND c.is_active = TRUE))
                      OR (u.role = 'OFFICER' AND EXISTS (SELECT 1 FROM authorities a WHERE a.officer_id = u.officer_id AND a.availability != 'Suspended')))""",
            (username, requested_role)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user or not verify_password(user["password_hash"], password):
            return jsonify({"error": "The username or password is incorrect."}), 401
        session.clear()
        session.permanent = True
        session["csrf_token"] = secrets.token_urlsafe(32)
        session["user"] = {
            "id": user["user_id"], "username": user["username"], "role": user["role"],
            "citizenId": user["citizen_id"], "officerId": user["officer_id"]
        }
        return jsonify({"user": session["user"], "csrfToken": session["csrf_token"]})
    except Exception as e:
        return internal_error()

@app.route("/api/auth/session", methods=["GET"])
def auth_session():
    return jsonify({"user": session.get("user"), "csrfToken": session.get("csrf_token")})

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})

# Driver selector: psycopg (v3) or psycopg2
HAS_PSYCOPG3 = False
HAS_PSYCOPG2 = False

try:
    import psycopg
    from psycopg.rows import dict_row
    HAS_PSYCOPG3 = True
except ImportError:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        HAS_PSYCOPG2 = True
    except ImportError:
        pass

def get_db_connection():
    if HAS_PSYCOPG3:
        return psycopg.connect(
            host=PGHOST,
            port=PGPORT,
            dbname=PGDATABASE,
            user=PGUSER,
            password=PGPASSWORD,
            row_factory=dict_row
        )
    elif HAS_PSYCOPG2:
        return psycopg2.connect(
            host=PGHOST,
            port=PGPORT,
            dbname=PGDATABASE,
            user=PGUSER,
            password=PGPASSWORD,
            cursor_factory=RealDictCursor
        )
    else:
        raise RuntimeError("No PostgreSQL driver found. Please install psycopg or psycopg2-binary.")

def role_required(*roles):
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = session.get("user")
            if not user:
                return jsonify({"error": "Sign in is required.", "code": "AUTH_REQUIRED"}), 401
            if roles and user.get("role") not in roles:
                return jsonify({"error": "Your account cannot perform this action.", "code": "FORBIDDEN"}), 403
            g.user = user
            return view(*args, **kwargs)
        return wrapped
    return decorate

def verify_password(stored_hash, password):
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except (ImportError, ValueError):
            return False
    try:
        return check_password_hash(stored_hash, password)
    except (ValueError, TypeError):
        return False

def map_complaint(row):
    if not row:
        return None
    created_at = row.get("created_at")
    return {
        "id": row.get("complaint_id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "category": row.get("category"),
        "location": row.get("location"),
        "tehsil": row.get("tehsil"),
        "ward": row.get("ward"),
        "department": row.get("department"),
        "priorityScore": row.get("priority_score"),
        "severity": row.get("severity"),
        "severityBase": row.get("severity_base"),
        "duplicateCount": row.get("duplicate_count"),
        "duplicateBoost": row.get("duplicate_boost"),
        "waitingDays": row.get("waiting_days"),
        "agingBoost": row.get("aging_boost"),
        "deadlineUrgencyBoost": row.get("deadline_urgency_boost", 0),
        "slaDeadline": row.get("sla_deadline").isoformat() if hasattr(row.get("sla_deadline"), "isoformat") else row.get("sla_deadline"),
        "status": row.get("status"),
        "processState": row.get("process_state"),
        "citizen": row.get("citizen_name", "Anonymous Citizen"),
        "citizenId": row.get("citizen_id"),
        "date": created_at.strftime("%b %d, %Y") if hasattr(created_at, "strftime") else str(created_at or ""),
        "time": created_at.strftime("%I:%M %p") if hasattr(created_at, "strftime") else "",
        "photo": row.get("photo_url") or "images/roads.jpg",
        "clusterId": row.get("cluster_id") or "CLUS-SINGLE",
        "assignedOfficerId": row.get("assigned_officer_id"),
        "resolvedAt": row.get("resolved_at").isoformat() if hasattr(row.get("resolved_at"), "isoformat") else None
    }

def ensure_scheduler_executable():
    source_missing = not os.path.exists(SCHEDULER_CPP)
    if source_missing:
        raise RuntimeError("C++ scheduler source file civic_os_engine.cpp was not found.")

    needs_build = not os.path.exists(SCHEDULER_EXE)
    if not needs_build:
        needs_build = os.path.getmtime(SCHEDULER_CPP) > os.path.getmtime(SCHEDULER_EXE)

    if not needs_build:
        return SCHEDULER_EXE

    compiler = os.getenv("CXX", "g++")
    result = subprocess.run(
        [compiler, "-std=c++11", SCHEDULER_CPP, "-o", SCHEDULER_EXE],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to compile C++ scheduler: {result.stderr or result.stdout}")
    return SCHEDULER_EXE

def scheduler_payload_from_row(row):
    created_at = row.get("created_at")
    deadline = row.get("sla_deadline") or row.get("assignment_deadline")
    return {
        "id": row.get("complaint_id"),
        "title": row.get("title"),
        "category": row.get("category"),
        "location": row.get("location"),
        "ward": row.get("ward"),
        "department": row.get("department"),
        "severityBase": row.get("severity_base"),
        "duplicateCount": row.get("duplicate_count"),
        "waitingDays": row.get("waiting_days"),
        "status": row.get("status"),
        "processState": row.get("process_state"),
        "createdAt": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at or ""),
        "slaDeadline": deadline.isoformat() if hasattr(deadline, "isoformat") else str(deadline or "")
    }

def run_cpp_scheduler(eligible_rows):
    executable = ensure_scheduler_executable()
    payload = [scheduler_payload_from_row(row) for row in eligible_rows]
    result = subprocess.run(
        [executable, "--schedule-json"],
        cwd=ROOT_DIR,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=10
    )
    if result.returncode != 0:
        raise RuntimeError(f"C++ scheduler failed: {result.stderr or result.stdout}")
    try:
        decision = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"C++ scheduler returned invalid JSON: {exc}") from exc
    if not decision.get("ok"):
        raise RuntimeError(decision.get("error", "C++ scheduler returned an error."))
    return decision

@app.route("/api/health", methods=["GET"])
def health():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT current_database() as db, version() as ver")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({
            "service": "Civic Smart Python API Backend",
            "status": "healthy",
            "database": {
                "connected": True,
                "database": row["db"],
                "version": row["ver"]
            }
        })
    except Exception as e:
        return jsonify({
            "service": "Civic Smart Python API Backend",
            "status": "database_disconnected",
            "database": {
                "connected": False,
                "error": "The database is not reachable.",
                "hint": "Check the PostgreSQL service and backend/.env settings."
            }
        }), 200

@app.route("/api/complaints", methods=["GET"])
@role_required("CITIZEN", "OFFICER", "ADMIN")
def get_complaints():
    status = request.args.get("status")
    category = request.args.get("category")
    ward = request.args.get("ward")
    search = request.args.get("search")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []

    if g.user["role"] == "CITIZEN":
        query += " AND citizen_id = %s"
        params.append(g.user["citizenId"])
    elif g.user["role"] == "OFFICER":
        query += " AND assigned_officer_id = %s"
        params.append(g.user["officerId"])

    if status:
        query += " AND status = %s"
        params.append(status)
    if category:
        query += " AND category = %s"
        params.append(category)
    if ward:
        query += " AND ward = %s"
        params.append(ward)
    if search:
        query += """ AND (
            LOWER(complaint_id) LIKE %s OR 
            LOWER(title) LIKE %s OR 
            LOWER(location) LIKE %s OR 
            LOWER(department) LIKE %s
        )"""
        s = f"%{search.lower()}%"
        params.extend([s, s, s, s])

    query += " ORDER BY priority_score DESC, created_at DESC"

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([map_complaint(r) for r in rows])
    except Exception as e:
        return internal_error()

@app.route("/api/complaints/<cid>", methods=["GET"])
def get_complaint(cid):
    clean_id = cid.upper().replace("#", "").strip()
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (clean_id,))
        complaint_row = cur.fetchone()
        if not complaint_row:
            cur.close()
            conn.close()
            return jsonify({"error": f"Complaint {clean_id} not found"}), 404

        complaint = map_complaint(complaint_row)
        user = session.get("user")
        if user and user["role"] == "CITIZEN" and complaint_row["citizen_id"] != user["citizenId"]:
            cur.close()
            conn.close()
            return jsonify({"error": "Complaint not found."}), 404
        if user and user["role"] == "OFFICER" and complaint_row["assigned_officer_id"] != user["officerId"]:
            cur.close()
            conn.close()
            return jsonify({"error": "Complaint not found."}), 404

        officer = None
        if user and complaint["assignedOfficerId"]:
            cur.execute("SELECT officer_id, name, role, department FROM authorities WHERE officer_id = %s", (complaint["assignedOfficerId"],))
            officer = cur.fetchone()
        if not user:
            complaint["citizen"] = ""
            complaint["citizenId"] = None
            complaint["assignedOfficerId"] = None

        cur.execute("SELECT * FROM assignments WHERE complaint_id = %s ORDER BY created_at DESC LIMIT 1", (clean_id,))
        assignment = cur.fetchone()

        cur.execute(
            """SELECT history_id as id, complaint_id as "complaintId", action,
                      from_status as "fromStatus", to_status as "toStatus", message, 
                      TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM status_history WHERE complaint_id = %s ORDER BY created_at DESC""",
            (clean_id,)
        )
        timeline = cur.fetchall()

        if not user:
            assignment = {"state": assignment["state"]} if assignment else None

        cur.close()
        conn.close()
        return jsonify({
            "complaint": complaint,
            "officer": officer,
            "assignment": assignment,
            "timeline": timeline
        })
    except Exception as e:
        return internal_error()

@app.route("/api/complaints", methods=["POST"])
def create_complaint():
    data = json_body()
    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    location = data.get("location")
    tehsil = data.get("tehsil", "Dehradun Sadar")
    ward = data.get("ward")
    severity = data.get("severity", "Medium")
    citizen = data.get("citizen", "Anonymous Citizen")
    photo = data.get("photo")

    signed_in_user = session.get("user")
    if signed_in_user and signed_in_user.get("role") != "CITIZEN":
        return jsonify({"error": "Only citizen accounts can submit a complaint."}), 403
    citizen_id = signed_in_user.get("citizenId") if signed_in_user else None
    if citizen_id:
        citizen = signed_in_user.get("username", citizen)

    if not all(isinstance(value, str) and value.strip() for value in [title, description, category, location, ward, tehsil, citizen]):
        return jsonify({"error": "Title, description, category, location, and ward are required."}), 400
    if len(title) > 255 or len(description) > 10000 or len(location) > 255 or len(ward) > 100 or len(citizen) > 120 or len(tehsil) > 100:
        return jsonify({"error": "One or more complaint fields exceed the allowed length."}), 400

    dept_map = {
        "Roads": "Road Infrastructure & Maintenance",
        "Water": "Municipal Water & Sewerage Board",
        "Waste": "Solid Waste & Sanitation Department",
        "Lighting": "Electrical & Street Lighting Wing",
        "Drainage": "Stormwater Drainage Division",
        "Electricity": "Electrical & Street Lighting Wing",
        "Other": "General Municipal Works"
    }
    if not isinstance(category, str) or category not in dept_map:
        return jsonify({"error": "Unsupported complaint category."}), 400
    severity_base = {"Low": 40, "Medium": 60, "High": 75, "Critical": 90}
    if not isinstance(severity, str) or severity not in severity_base:
        return jsonify({"error": "Severity must be Low, Medium, High, or Critical."}), 400
    department = dept_map[category]
    cluster_id = f"CLUS-{int(1000 + (abs(hash(title)) % 8999))}"

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if citizen_id:
            cur.execute("SELECT name FROM citizens WHERE citizen_id = %s", (citizen_id,))
            citizen_row = cur.fetchone()
            if not citizen_row:
                cur.close()
                conn.close()
                return jsonify({"error": "Citizen account was not found."}), 401
            citizen = citizen_row["name"]

        complaint_id = f"CS{secrets.token_hex(6).upper()}"

        cur.execute(
            """INSERT INTO complaints (
                complaint_id, citizen_id, citizen_name, title, description, category, department,
                location, tehsil, ward, severity, photo_url, cluster_id, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Reported')
            RETURNING *""",
            (complaint_id, citizen_id, citizen, title, description, category, department, location, tehsil, ward, severity, photo, cluster_id)
        )
        inserted = cur.fetchone()

        cur.execute(
            """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
               VALUES (%s, %s, 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in PostgreSQL.')""",
            (complaint_id, signed_in_user.get("username") if signed_in_user else "Public report")
        )

        cur.execute(
            """INSERT INTO notifications (target_role, complaint_id, message)
               VALUES ('ADMIN', %s, %s)""",
            (complaint_id, f"New {category} complaint #{complaint_id} submitted in {ward}.")
        )

        conn.commit()
        cur.close()
        conn.close()
        return jsonify(map_complaint(inserted)), 201
    except Exception as e:
        return internal_error()

@app.route("/api/complaints/<cid>/status", methods=["PATCH", "PUT"])
@app.route("/api/complaints/<cid>", methods=["PUT", "PATCH"])
@role_required("ADMIN")
def update_status(cid):
    clean_id = cid.upper().replace("#", "").strip()
    data = json_body()
    status = data.get("status")
    reason = str(data.get("reason", "")).strip()

    allowed = {
        "Reported": {"Verified", "Rejected"},
        "Verified": {"Reported", "Rejected"},
        "Completion Submitted": {"Resolved", "In Progress"},
        "Disputed": {"Resolved", "In Progress", "Rejected"}
    }
    if not isinstance(status, str):
        return jsonify({"error": "Status is required."}), 400
    if len(reason) > 1000:
        return jsonify({"error": "Reason must be 1000 characters or fewer."}), 400
    if status not in {"Reported", "Verified", "Rejected", "Resolved", "In Progress"}:
        return jsonify({"error": "Unsupported status."}), 400
    if status in {"Rejected", "Resolved", "In Progress"} and not reason:
        return jsonify({"error": "A review reason is required for this transition."}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s FOR UPDATE", (clean_id,))
        current = cur.fetchone()
        if not current:
            cur.close()
            conn.close()
            return jsonify({"error": "Complaint not found."}), 404
        if status not in allowed.get(current["status"], set()):
            cur.close()
            conn.close()
            return jsonify({"error": f"Transition from {current['status']} to {status} is not allowed."}), 409
        cur.execute("SELECT set_config('civic_smart.current_actor', %s, true)", (g.user["username"],))
        cur.execute("SELECT set_config('civic_smart.current_role', %s, true)", ("ADMIN",))
        cur.execute("SELECT set_config('civic_smart.current_message', %s, true)", (reason or f"Authority changed status to {status}.",))
        if status in {"Resolved", "In Progress"}:
            cur.execute(
                """SELECT assignment_id, state FROM assignments
                   WHERE complaint_id = %s AND state NOT IN ('REJECTED', 'COMPLETED')
                   ORDER BY created_at DESC LIMIT 1 FOR UPDATE""",
                (clean_id,)
            )
            assignment = cur.fetchone()
            if not assignment or assignment["state"] != "COMPLETION_SUBMITTED":
                conn.rollback()
                cur.close()
                conn.close()
                return jsonify({"error": "This complaint has no completion submission awaiting authority review."}), 409
            assignment_state = "COMPLETED" if status == "Resolved" else "IN_PROGRESS"
            cur.execute("UPDATE assignments SET state = %s WHERE assignment_id = %s",
                        (assignment_state, assignment["assignment_id"]))
            cur.execute(
                """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
                   VALUES (%s, %s, 'ADMIN', %s, %s, %s, %s)""",
                (clean_id, g.user["username"], "Resolution Verified" if status == "Resolved" else "Completion Returned",
                 assignment["state"], assignment_state, reason)
            )
        cur.execute("UPDATE complaints SET status = %s WHERE complaint_id = %s RETURNING *", (status, clean_id))
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        if not updated:
            return jsonify({"error": "Complaint not found"}), 404
        return jsonify(map_complaint(updated))
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return internal_error()

@app.route("/api/officers", methods=["GET"])
@role_required("OFFICER", "ADMIN")
def get_officers():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if g.user["role"] == "OFFICER":
            cur.execute("SELECT * FROM vw_officer_workload WHERE officer_id = %s", (g.user["officerId"],))
        else:
            cur.execute("SELECT * FROM vw_officer_workload")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([{
            "id": r["officer_id"],
            "name": r["officer_name"],
            "role": r["role"],
            "department": r["department"],
            "capacity": int(r["max_capacity"]),
            "activeLoad": int(r["active_assignments"]),
            "availableSlots": int(r["available_slots"]),
            "utilizationPercent": float(r["utilization_percent"]),
            "availability": r["availability"]
        } for r in rows])
    except Exception as e:
        return internal_error()

@app.route("/api/assignments", methods=["GET"])
@role_required("OFFICER", "ADMIN")
def get_assignments():
    officer_id = request.args.get("officerId")
    complaint_id = request.args.get("complaintId")
    query = "SELECT * FROM assignments WHERE 1=1"
    params = []
    if officer_id:
        query += " AND officer_id = %s"
        params.append(officer_id)
    if g.user["role"] == "OFFICER":
        query += " AND officer_id = %s"
        params.append(g.user["officerId"])
    if complaint_id:
        query += " AND complaint_id = %s"
        params.append(complaint_id)
    query += " ORDER BY created_at DESC"
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify([{
            "id": r["assignment_id"],
            "complaintId": r["complaint_id"],
            "officerId": r["officer_id"],
            "state": r["state"],
            "actor": r["actor"],
            "deadline": r["deadline"].isoformat() if hasattr(r.get("deadline"), "isoformat") else r.get("deadline"),
            "rejectionReason": r.get("rejection_reason"),
            "blocker": r.get("blocker"),
            "completionNote": r.get("completion_note"),
            "createdAt": r["created_at"].isoformat() if hasattr(r.get("created_at"), "isoformat") else str(r.get("created_at"))
        } for r in rows])
    except Exception as e:
        return internal_error()

@app.route("/api/assignments/<assignment_id>/state", methods=["PATCH"])
@role_required("OFFICER")
def update_assignment_state(assignment_id):
    data = json_body()
    next_state = data.get("state")
    transitions = {
        "PENDING_ACCEPTANCE": {"ACCEPTED", "REJECTED"},
        "ACCEPTED": {"IN_PROGRESS"},
        "IN_PROGRESS": {"BLOCKED", "COMPLETION_SUBMITTED"},
        "BLOCKED": {"IN_PROGRESS"}
    }
    if next_state not in {state for states in transitions.values() for state in states}:
        return jsonify({"error": "Unsupported assignment state."}), 400
    details = {
        "REJECTED": str(data.get("rejectionReason", "")).strip(),
        "BLOCKED": str(data.get("blocker", "")).strip(),
        "COMPLETION_SUBMITTED": str(data.get("completionNote", "")).strip()
    }
    if any(len(value) > 1000 for value in details.values()):
        return jsonify({"error": "Workflow notes must be 1000 characters or fewer."}), 400
    if next_state in details and not details[next_state]:
        return jsonify({"error": "A reason or completion note is required for this action."}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM assignments WHERE assignment_id = %s FOR UPDATE", (assignment_id,))
        assignment = cur.fetchone()
        if not assignment:
            conn.rollback()
            return jsonify({"error": "Assignment not found."}), 404
        if assignment["officer_id"] != g.user["officerId"]:
            conn.rollback()
            return jsonify({"error": "This assignment belongs to another officer."}), 403
        if next_state not in transitions.get(assignment["state"], set()):
            conn.rollback()
            return jsonify({"error": f"Transition from {assignment['state']} to {next_state} is not allowed."}), 409

        complaint_status = {
            "ACCEPTED": "Assigned", "IN_PROGRESS": "In Progress", "BLOCKED": "Blocked",
            "COMPLETION_SUBMITTED": "Completion Submitted", "REJECTED": "Verified"
        }[next_state]
        actor = g.user["username"]
        cur.execute("SELECT set_config('civic_smart.current_actor', %s, true)", (actor,))
        cur.execute("SELECT set_config('civic_smart.current_role', 'OFFICER', true)")
        cur.execute("SELECT set_config('civic_smart.current_message', %s, true)", (details.get(next_state) or f"Assignment moved to {next_state}.",))
        cur.execute(
            """UPDATE assignments SET state = %s,
                      rejection_reason = CASE WHEN %s = 'REJECTED' THEN %s ELSE rejection_reason END,
                      blocker = CASE WHEN %s = 'BLOCKED' THEN %s ELSE blocker END,
                      completion_note = CASE WHEN %s = 'COMPLETION_SUBMITTED' THEN %s ELSE completion_note END
               WHERE assignment_id = %s RETURNING *""",
            (next_state, next_state, details.get("REJECTED"), next_state, details.get("BLOCKED"),
             next_state, details.get("COMPLETION_SUBMITTED"), assignment_id)
        )
        updated_assignment = cur.fetchone()
        cur.execute(
            "UPDATE complaints SET status = %s, assigned_officer_id = CASE WHEN %s = 'REJECTED' THEN NULL ELSE assigned_officer_id END WHERE complaint_id = %s RETURNING *",
            (complaint_status, next_state, assignment["complaint_id"])
        )
        updated_complaint = cur.fetchone()
        cur.execute(
            """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
               VALUES (%s, %s, 'OFFICER', 'Assignment State', %s, %s, %s)""",
            (assignment["complaint_id"], actor, assignment["state"], next_state,
             details.get(next_state) or f"Assignment moved to {next_state}.")
        )
        cur.execute(
            "INSERT INTO notifications (target_role, complaint_id, message) VALUES ('ADMIN', %s, %s)",
            (assignment["complaint_id"], f"Assignment {assignment_id} changed to {next_state}.")
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "assignment": updated_assignment, "complaint": map_complaint(updated_complaint)})
    except Exception as e:
        try:
            conn.rollback()
            cur.close()
            conn.close()
        except Exception:
            pass
        return internal_error()

@app.route("/api/complaints/<cid>/allocate", methods=["POST"])
@role_required("ADMIN")
def allocate_officer(cid):
    clean_id = cid.upper().replace("#", "").strip()
    data = json_body()
    reason = str(data.get("reason", "")).strip()
    if not reason or len(reason) > 1000:
        return jsonify({"error": "Enter a reason for manual allocation (up to 1000 characters)."}), 400
    actor = g.user["username"]
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT status, assigned_officer_id FROM complaints WHERE complaint_id = %s FOR UPDATE", (clean_id,))
        candidate = cur.fetchone()
        if not candidate:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"ok": False, "reason": "COMPLAINT_NOT_FOUND", "error": "Complaint not found."}), 404
        if candidate["status"] not in {"Reported", "Verified"} or candidate["assigned_officer_id"]:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"ok": False, "reason": "COMPLAINT_NOT_ELIGIBLE", "error": "Complaint is not eligible for allocation."}), 409
        cur.execute("SELECT set_config('civic_smart.current_message', %s, true)", (reason,))
        cur.execute("CALL sp_allocate_officer(%s, %s)", (clean_id, actor))
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (clean_id,))
        updated = cur.fetchone()
        if not updated:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({"ok": False, "reason": "COMPLAINT_NOT_FOUND", "error": "Complaint not found."}), 404
        if not updated.get("assigned_officer_id"):
            failure_message = f"Manual allocation found no eligible officer. Reason: {reason}"
            cur.execute(
                """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
                   VALUES (%s, %s, 'ADMIN', 'Allocation Failed', %s, %s, %s)""",
                (clean_id, actor, candidate["status"], candidate["status"], failure_message)
            )
            cur.execute("INSERT INTO notifications (target_role, complaint_id, message) VALUES ('ADMIN', %s, %s)",
                        (clean_id, failure_message))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({"ok": False, "reason": "NO_ELIGIBLE_OFFICER", "error": "No eligible officer is available."}), 409
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "complaint": map_complaint(updated)})
    except Exception as e:
        return internal_error(ok=True)

@app.route("/api/scheduler/aging", methods=["POST"])
@role_required("ADMIN")
def simulate_aging():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("CALL sp_simulate_daily_aging()")
        conn.commit()
        cur.execute("SELECT COUNT(*) as count FROM complaints WHERE status NOT IN ('Resolved', 'Completion Submitted')")
        cnt_row = cur.fetchone()
        cnt = cnt_row["count"] if isinstance(cnt_row, dict) else cnt_row[0]
        cur.close()
        conn.close()
        return jsonify({"ok": True, "activeCount": cnt})
    except Exception as e:
        return internal_error()

@app.route("/api/scheduler/run", methods=["POST"])
@role_required("ADMIN")
def run_scheduler():
    actor = g.user["username"]

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT pg_advisory_xact_lock(hashtext('civic_smart_scheduler'))")

        cur.execute("""
            SELECT 
                c.*,
                asn.deadline AS assignment_deadline
            FROM complaints c
            LEFT JOIN assignments asn
                ON c.complaint_id = asn.complaint_id
               AND asn.state NOT IN ('REJECTED', 'COMPLETED')
            WHERE c.status IN ('Reported', 'Verified')
              AND c.assigned_officer_id IS NULL
              AND asn.assignment_id IS NULL
            ORDER BY c.priority_score DESC, c.created_at ASC
        """)
        eligible = cur.fetchall()

        if not eligible:
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "NO_ELIGIBLE_COMPLAINTS",
                "message": "No unassigned reported or verified complaints are ready for scheduling."
            }), 409

        scheduler_started = time.perf_counter()
        decision = run_cpp_scheduler(eligible)
        scheduler_execution_ms = round((time.perf_counter() - scheduler_started) * 1000, 2)
        selected = decision.get("selected")
        if not selected:
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "SCHEDULER_SELECTED_NONE",
                "decision": decision
            }), 409

        eligible_ids = {row["complaint_id"] for row in eligible}
        selected_id = str(selected.get("id", "")).upper().replace("#", "").strip()
        if selected_id not in eligible_ids:
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "SCHEDULER_SELECTED_INELIGIBLE_COMPLAINT",
                "selected": selected
            }), 409

        cur.execute(
            """SELECT * FROM complaints
               WHERE complaint_id = %s
                 AND status IN ('Reported', 'Verified')
                 AND assigned_officer_id IS NULL
                 AND NOT EXISTS (
                     SELECT 1 FROM assignments
                     WHERE assignments.complaint_id = complaints.complaint_id
                       AND assignments.state NOT IN ('REJECTED', 'COMPLETED')
                 )
               FOR UPDATE""",
            (selected_id,)
        )
        still_eligible = cur.fetchone()
        if not still_eligible:
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "COMPLAINT_NO_LONGER_ELIGIBLE",
                "selected": selected
            }), 409

        cur.execute("CALL sp_allocate_officer(%s, %s)", (selected_id, actor))
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (selected_id,))
        updated = cur.fetchone()
        if not updated or not updated.get("assigned_officer_id"):
            failure_message = f"C++ selected {selected_id}, but PostgreSQL found no eligible officer. Policy: {decision.get('policy', 'unknown')}; eligible complaints: {len(eligible)}."
            cur.execute(
                """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
                   VALUES (%s, 'OS Scheduler', 'SYSTEM', 'Allocation Failed', %s, %s, %s)""",
                (selected_id, still_eligible["status"], still_eligible["status"], failure_message)
            )
            cur.execute("INSERT INTO notifications (target_role, complaint_id, message) VALUES ('ADMIN', %s, %s)",
                        (selected_id, failure_message))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "NO_ELIGIBLE_OFFICER",
                "message": failure_message,
                "selected": selected,
                "executionMs": scheduler_execution_ms
            }), 409

        cur.execute(
            """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
               VALUES (%s, %s, 'SYSTEM', 'C++ Scheduler Decision', %s, %s, %s)""",
            (
                selected_id,
                "OS Scheduler",
                still_eligible["status"],
                updated["status"],
                f"{selected.get('reason', 'Complaint selected by C++ priority scheduler.')} Policy={decision.get('policy')}; eligible={len(eligible)}; elapsedMs={scheduler_execution_ms}."
            )
        )
        conn.commit()

        cur.execute("SELECT * FROM assignments WHERE complaint_id = %s ORDER BY created_at DESC LIMIT 1", (selected_id,))
        assignment = cur.fetchone()
        cur.close()
        conn.close()

        return jsonify({
            "ok": True,
            "eligibleCount": decision.get("eligibleCount"),
            "policy": decision.get("policy"),
            "executionMs": scheduler_execution_ms,
            "selected": selected,
            "complaint": map_complaint(updated),
            "assignment": assignment
        })
    except Exception as e:
        try:
            conn.rollback()
            cur.close()
            conn.close()
        except Exception:
            pass
        return internal_error(ok=True)

@app.route("/api/scheduler/mlq", methods=["GET"])
@role_required("ADMIN")
def get_mlq():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM vw_priority_queue_mlq")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return internal_error()

@app.route("/api/audit", methods=["GET"])
@role_required("CITIZEN", "OFFICER", "ADMIN")
def get_audit():
    complaint_id = request.args.get("complaintId")
    query = """SELECT history_id as id, complaint_id as "complaintId", actor, role, action, 
                      from_status as "fromStatus", to_status as "toStatus", message, 
                      TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM status_history"""
    filters = []
    params = []
    if complaint_id:
        filters.append("complaint_id = %s")
        params.append(complaint_id)
    if g.user["role"] == "CITIZEN":
        filters.append("complaint_id IN (SELECT complaint_id FROM complaints WHERE citizen_id = %s)")
        params.append(g.user["citizenId"])
    elif g.user["role"] == "OFFICER":
        filters.append("complaint_id IN (SELECT complaint_id FROM assignments WHERE officer_id = %s)")
        params.append(g.user["officerId"])
    if filters:
        query += " WHERE " + " AND ".join(filters)
    query += " ORDER BY created_at DESC LIMIT 100"
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return internal_error()

@app.route("/api/notifications", methods=["GET"])
@role_required("CITIZEN", "OFFICER", "ADMIN")
def get_notifications():
    role = g.user["role"]
    query = """SELECT notification_id as id, target_role as "targetRole", complaint_id as "complaintId", 
                      message, is_read as read, TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM notifications"""
    query += " WHERE target_role = %s AND target_user_id = %s" if role != "ADMIN" else " WHERE target_role = %s AND (target_user_id IS NULL OR target_user_id = %s)"
    params = [role, g.user["id"]]
    query += " ORDER BY created_at DESC LIMIT 50"
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return internal_error()

@app.route("/api/notifications/<int:notification_id>/read", methods=["PATCH"])
@role_required("CITIZEN", "OFFICER", "ADMIN")
def mark_notification_read(notification_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """UPDATE notifications SET is_read = TRUE
               WHERE notification_id = %s AND target_role = %s
                 AND (target_user_id = %s OR (%s = 'ADMIN' AND target_user_id IS NULL))
               RETURNING notification_id""",
            (notification_id, g.user["role"], g.user["id"], g.user["role"])
        )
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if not updated:
            return jsonify({"error": "Notification not found."}), 404
        return jsonify({"ok": True})
    except Exception as e:
        return internal_error()

@app.route("/api/analytics/overview", methods=["GET"])
@role_required("ADMIN")
def get_analytics():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('Reported', 'Verified')) as pending,
                COUNT(*) FILTER (WHERE status IN ('Assigned', 'In Progress', 'Blocked', 'Completion Submitted')) as in_progress,
                COUNT(*) FILTER (WHERE priority_score >= 85 AND status != 'Resolved') as critical,
                COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
                COUNT(DISTINCT cluster_id) as clusters
            FROM complaints
        """)
        stats = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify(stats)
    except Exception as e:
        return internal_error()

if __name__ == "__main__":
    print(f"========================================================")
    print(f" CIVIC SMART - PYTHON REST API BACKEND")
    print(f" Running on: http://localhost:{PORT}")
    print(f" Health check: http://localhost:{PORT}/api/health")
    print(f"========================================================")
    app.run(host="0.0.0.0", port=PORT, debug=False)
