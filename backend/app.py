"""
Civic Smart - Python Flask REST API Backend
PostgreSQL DBMS Integration for Municipal Grievance & OS Scheduling
Works with standard Python installations and embedded PostgreSQL/pgAdmin Python.
"""

import os
import sys
import json
import secrets
import hmac
import subprocess
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, g
import bcrypt

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

# Load .env from the backend directory regardless of the process working directory.
def load_env_file():
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(dotenv_path=env_path, override=False)

load_env_file()

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCHEDULER_CPP = os.path.join(ROOT_DIR, "civic_os_engine.cpp")
SCHEDULER_EXE = os.path.join(ROOT_DIR, "civic_os_engine.exe" if sys.platform == "win32" else "civic_os_engine")
app = Flask(__name__, static_folder=ROOT_DIR, static_url_path="")

@app.route("/")
def index():
    return app.send_static_file("index.html")

PORT = int(os.getenv("PORT", "5000"))
PGHOST = os.getenv("PGHOST")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE")
PGUSER = os.getenv("PGUSER")
PGPASSWORD = os.getenv("PGPASSWORD")
SECRET_KEY = os.getenv("SECRET_KEY")
required_settings = {
    "PGHOST": PGHOST,
    "PGDATABASE": PGDATABASE,
    "PGUSER": PGUSER,
    "PGPASSWORD": PGPASSWORD,
    "SECRET_KEY": SECRET_KEY,
}
missing_settings = [key for key, value in required_settings.items() if not value or not value.strip()]
if missing_settings:
    raise RuntimeError("Missing required environment settings: " + ", ".join(missing_settings))
if PGDATABASE != "civic_smart_m1_8c_test":
    raise RuntimeError(
        "Phase III authentication testing must use "
        "civic_smart_m1_8c_test. Refusing to start."
    )

app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_NAME="civic_smart_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=False,  # Local HTTP testing only; set True for HTTPS deployment.
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    SESSION_REFRESH_EACH_REQUEST=True,
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)

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


def get_authenticated_user():
    user_id = session.get("user_id")
    session_version = session.get("session_version")
    if not user_id or session_version is None:
        return None

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT user_id, role, display_name, citizen_id, officer_id,
                   is_active, session_version
            FROM app_users
            WHERE user_id = %s
            """,
            (user_id,),
        )
        user = cur.fetchone()
        if not user:
            session.clear()
            return None
        if not user["is_active"] or str(user["session_version"]) != str(session_version):
            session.clear()
            return None
        return {
            "userId": user["user_id"],
            "role": user["role"],
            "displayName": user["display_name"],
            "citizenId": user["citizen_id"],
            "officerId": user["officer_id"],
        }
    except Exception:
        session.clear()
        app.logger.exception("Failed to verify authenticated session")
        return None
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def require_roles(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = get_authenticated_user()
            if not user:
                return jsonify({"error": "Authentication required."}), 401
            if roles and user["role"] not in roles:
                return jsonify({"error": "Forbidden."}), 403
            g.current_user = user
            return view(*args, **kwargs)
        return wrapped
    return decorator


def require_csrf(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        origin = request.headers.get("Origin", "")
        expected_origin = request.host_url.rstrip("/")
        if not origin or origin.rstrip("/") != expected_origin:
            return jsonify({"error": "Invalid request origin."}), 403
        if not valid_csrf_token():
            return jsonify({"error": "Invalid or missing CSRF token."}), 403
        return view(*args, **kwargs)
    return wrapped


def complaint_scope_sql(user, alias="c"):
    role = user["role"]
    if role == "ADMIN":
        return "TRUE", []
    if role == "CITIZEN" and user.get("citizenId"):
        return f"{alias}.citizen_id = %s", [user["citizenId"]]
    if role == "OFFICER" and user.get("officerId"):
        return f"{alias}.assigned_officer_id = %s", [user["officerId"]]
    # Ward Superior access remains unavailable until verified ward scope exists.
    return "FALSE", []


def can_access_complaint(cur, complaint_id, user):
    scope, params = complaint_scope_sql(user)
    cur.execute(
        f"""
        SELECT 1
        FROM complaints c
        WHERE c.complaint_id = %s
          AND ({scope})
        """,
        (complaint_id, *params),
    )
    return cur.fetchone() is not None


def valid_csrf_token():
    supplied = request.headers.get("X-CSRF-Token", "")
    expected = session.get("csrf_token", "")
    origin = request.headers.get("Origin", "")
    if not origin or origin.rstrip("/") != request.host_url.rstrip("/"):
        return False
    return bool(
        supplied
        and expected
        and hmac.compare_digest(supplied, expected)
    )


@app.route("/api/auth/csrf", methods=["GET"])
def auth_csrf():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return jsonify({"csrfToken": token})


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    if not valid_csrf_token():
        return jsonify({"error": "Invalid CSRF token."}), 403
    payload = request.get_json(silent=True) or {}
    identifier = payload.get("identifier")
    password = payload.get("password")
    if not isinstance(identifier, str) or not isinstance(password, str) or not identifier.strip() or not password:
        return jsonify({"error": "Invalid identifier or password."}), 401

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.user_id, u.role, u.display_name, u.citizen_id, u.officer_id,
                   u.password_hash, u.is_active, u.session_version
            FROM app_users AS u
            JOIN app_user_identifiers AS i ON i.user_id = u.user_id
            WHERE i.identifier_normalized = LOWER(BTRIM(%s))
            LIMIT 1
            """,
            (identifier,),
        )
        account = cur.fetchone()
        password_ok = False
        if account and account["is_active"]:
            try:
                encoded_hash = account["password_hash"].encode("utf-8")
                password_ok = bcrypt.checkpw(password.encode("utf-8"), encoded_hash)
            except (ValueError, TypeError, AttributeError):
                password_ok = False
        if not password_ok:
            return jsonify({"error": "Invalid identifier or password."}), 401

        session.clear()
        session.permanent = True
        session["user_id"] = account["user_id"]
        session["session_version"] = account["session_version"]
        session["csrf_token"] = secrets.token_urlsafe(32)
        user = {
            "userId": account["user_id"],
            "role": account["role"],
            "displayName": account["display_name"],
            "citizenId": account["citizen_id"],
            "officerId": account["officer_id"],
        }
        return jsonify({"user": user, "csrfToken": session["csrf_token"]})
    except Exception:
        app.logger.exception("Authentication request failed")
        return jsonify({"error": "Authentication is temporarily unavailable."}), 503
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401
    return jsonify({"user": user})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    user = get_authenticated_user()
    if not user:
        return jsonify({"error": "Authentication required."}), 401
    if not valid_csrf_token():
        return jsonify({"error": "Invalid CSRF token."}), 403
    session.clear()
    return jsonify({"ok": True})

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
    deadline = row.get("assignment_deadline")
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
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        return jsonify({
            "service": "Civic Smart API",
            "status": "healthy",
            "databaseConnected": True,
        }), 200
    except Exception:
        app.logger.exception("Health check failed")
        return jsonify({
            "service": "Civic Smart API",
            "status": "unavailable",
            "databaseConnected": False,
        }), 503
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/complaints", methods=["GET"])
@require_roles("CITIZEN", "OFFICER", "ADMIN")
def get_complaints():
    status = request.args.get("status")
    category = request.args.get("category")
    ward = request.args.get("ward")
    search = request.args.get("search")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []
    scope, scope_params = complaint_scope_sql(g.current_user)
    query += f" AND ({scope})"
    params.extend(scope_params)

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
        return jsonify({"error": str(e)}), 500

@app.route("/api/complaints/<cid>", methods=["GET"])
@require_roles("CITIZEN", "OFFICER", "ADMIN")
def get_complaint(cid):
    clean_id = cid.upper().replace("#", "").strip()
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        if not can_access_complaint(cur, clean_id, g.current_user):
            cur.close()
            conn.close()
            return jsonify({"error": "Complaint not found or access denied."}), 404
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (clean_id,))
        complaint_row = cur.fetchone()
        if not complaint_row:
            cur.close()
            conn.close()
            return jsonify({"error": f"Complaint {clean_id} not found"}), 404

        complaint = map_complaint(complaint_row)

        officer = None
        if complaint["assignedOfficerId"]:
            cur.execute("SELECT * FROM authorities WHERE officer_id = %s", (complaint["assignedOfficerId"],))
            officer = cur.fetchone()

        cur.execute("SELECT * FROM assignments WHERE complaint_id = %s ORDER BY created_at DESC LIMIT 1", (clean_id,))
        assignment = cur.fetchone()

        cur.execute(
            """SELECT history_id as id, complaint_id as "complaintId", actor, role, action, 
                      from_status as "fromStatus", to_status as "toStatus", message, 
                      TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM status_history WHERE complaint_id = %s ORDER BY created_at DESC""",
            (clean_id,)
        )
        timeline = cur.fetchall()

        cur.close()
        conn.close()
        return jsonify({
            "complaint": complaint,
            "officer": officer,
            "assignment": assignment,
            "timeline": timeline
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/complaints", methods=["POST"])
@require_roles("CITIZEN")
@require_csrf
def create_complaint():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    location = data.get("location")
    tehsil = data.get("tehsil", "Dehradun Sadar")
    ward = data.get("ward")
    severity = data.get("severity", "Medium")
    citizen = g.current_user["displayName"]
    citizen_id = g.current_user["citizenId"]
    if not citizen_id:
        return jsonify({"error": "Citizen account is not linked correctly."}), 403
    photo = data.get("photo")

    required_fields = {
        "title": title,
        "description": description,
        "category": category,
        "location": location,
        "ward": ward,
    }
    if any(not isinstance(value, str) or not value.strip() for value in required_fields.values()):
        return jsonify({"error": "Missing mandatory fields"}), 400

    allowed_categories = {
        "Roads", "Water", "Waste", "Lighting", "Drainage", "Electricity", "Other"
    }
    allowed_severities = {"Low", "Medium", "High", "Critical"}
    if category not in allowed_categories:
        return jsonify({"error": "Invalid complaint category"}), 400
    if not isinstance(severity, str) or severity not in allowed_severities:
        return jsonify({"error": "Invalid complaint severity"}), 400
    title = title.strip()
    description = description.strip()
    location = location.strip()
    tehsil = tehsil.strip() if isinstance(tehsil, str) and tehsil.strip() else "Dehradun Sadar"
    ward = ward.strip()

    dept_map = {
        "Roads": "Road Infrastructure & Maintenance",
        "Water": "Municipal Water & Sewerage Board",
        "Waste": "Solid Waste & Sanitation Department",
        "Lighting": "Electrical & Street Lighting Wing",
        "Drainage": "Stormwater Drainage Division",
        "Electricity": "Electrical & Street Lighting Wing",
        "Other": "General Municipal Works",
    }
    department = dept_map[category]
    cluster_id = f"CLUS-{int(1000 + (abs(hash(title)) % 8999))}"
    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT nextval('public.complaint_id_seq')")
        sequence_row = cur.fetchone()
        complaint_number = (
            sequence_row["nextval"]
            if isinstance(sequence_row, dict)
            else sequence_row[0]
        )
        complaint_id = f"CS{complaint_number}"

        cur.execute(
            """
            INSERT INTO complaints (
                complaint_id, citizen_id, citizen_name, title, description,
                category, department, location, tehsil, ward, severity,
                photo_url, cluster_id, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Reported')
            RETURNING *
            """,
            (
                complaint_id, citizen_id, citizen, title, description,
                category, department, location, tehsil, ward, severity,
                photo, cluster_id,
            ),
        )
        inserted = cur.fetchone()

        cur.execute(
            """
            INSERT INTO status_history (
                complaint_id, actor, role, action, from_status, to_status, message
            ) VALUES (
                %s, %s, 'CITIZEN', 'Complaint Registered',
                '', 'Reported', 'Citizen report stored in PostgreSQL.'
            )
            """,
            (complaint_id, citizen),
        )
        cur.execute(
            """
            INSERT INTO notifications (target_role, complaint_id, message)
            VALUES ('ADMIN', %s, %s)
            """,
            (
                complaint_id,
                f"New {category} complaint #{complaint_id} submitted in {ward}.",
            ),
        )

        conn.commit()
        return jsonify(map_complaint(inserted)), 201
    except Exception:
        if conn:
            conn.rollback()
        app.logger.exception("Complaint creation failed")
        return jsonify({"error": "Complaint creation failed"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/complaints/<cid>/status", methods=["PATCH", "PUT"])
@app.route("/api/complaints/<cid>", methods=["PUT", "PATCH"])
@require_roles("ADMIN")
@require_csrf
def update_status(cid):
    clean_id = cid.upper().replace("#", "").strip()
    data = request.json or {}
    status = data.get("status")
    actor = g.current_user["displayName"]
    role = g.current_user["role"]

    if not status and "status" not in data:
        return jsonify({"error": "Status is required"}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT set_config('civic_smart.current_actor', %s, true)", (actor,))
        cur.execute("SELECT set_config('civic_smart.current_role', %s, true)", (role,))
        
        # If full complaint object is provided in PUT
        if status:
            cur.execute(
                "UPDATE complaints SET status = %s WHERE complaint_id = %s RETURNING *",
                (status, clean_id)
            )
        else:
            cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (clean_id,))
            
        updated = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        if not updated:
            return jsonify({"error": "Complaint not found"}), 404
        return jsonify(map_complaint(updated))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/officers", methods=["GET"])
@require_roles("ADMIN")
def get_officers():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/assignments", methods=["GET"])
@require_roles("OFFICER", "CITIZEN", "ADMIN")
def get_assignments():
    officer_id = request.args.get("officerId")
    complaint_id = request.args.get("complaintId")
    query = """
        SELECT a.*
        FROM assignments a
        JOIN complaints c ON c.complaint_id = a.complaint_id
        WHERE 1=1
    """
    params = []
    user = g.current_user
    if user["role"] == "OFFICER":
        query += " AND a.officer_id = %s"
        params.append(user["officerId"])
    elif user["role"] == "CITIZEN":
        query += " AND c.citizen_id = %s"
        params.append(user["citizenId"])
    if officer_id:
        query += " AND a.officer_id = %s"
        params.append(officer_id)
    if complaint_id:
        query += " AND a.complaint_id = %s"
        params.append(complaint_id)
    query += " ORDER BY a.created_at DESC"
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/assignments/<assignment_id>/state", methods=["PATCH"])
@require_roles("OFFICER")
@require_csrf
def update_assignment_state(assignment_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    requested_state = data.get("state")
    if not isinstance(requested_state, str):
        return jsonify({"error": "Assignment state is required"}), 400
    new_state = requested_state.strip().upper()
    valid_states = {
        "PENDING_ACCEPTANCE",
        "ACCEPTED",
        "IN_PROGRESS",
        "BLOCKED",
        "COMPLETION_SUBMITTED",
        "REJECTED",
        "COMPLETED",
    }
    if not new_state:
        return jsonify({"error": "Assignment state is required"}), 400
    if new_state not in valid_states:
        return jsonify({"error": "Unknown assignment state"}), 400

    transitions = {
        "PENDING_ACCEPTANCE": {"ACCEPTED", "REJECTED"},
        "ACCEPTED": {"IN_PROGRESS"},
        "BLOCKED": {"IN_PROGRESS"},
        "IN_PROGRESS": {"BLOCKED", "COMPLETION_SUBMITTED"},
    }

    detail_fields = {
        "REJECTED": ("rejectionReason", "rejection_reason", "A rejection reason is required"),
        "BLOCKED": ("blocker", "blocker", "A blocker description is required"),
        "COMPLETION_SUBMITTED": (
            "completionNote",
            "completion_note",
            "A completion note is required",
        ),
    }
    detail = None
    if new_state in detail_fields:
        camel_key, snake_key, error_message = detail_fields[new_state]
        detail = data.get(camel_key, data.get(snake_key))
        if not isinstance(detail, str) or not detail.strip():
            return jsonify({"error": error_message}), 400
        detail = detail.strip()

    assignment_id = assignment_id.strip()
    actor = g.current_user["displayName"]
    actor_role = g.current_user["role"]
    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Lock the assignment and its complaint in a consistent order before validation.
        cur.execute(
            """
            SELECT assignment_id, complaint_id, officer_id, state
            FROM assignments
            WHERE assignment_id = %s
              AND officer_id = %s
            FOR UPDATE
            """,
            (assignment_id, g.current_user["officerId"]),
        )
        assignment = cur.fetchone()
        if not assignment:
            conn.rollback()
            return jsonify({"error": "Assignment not found"}), 404

        cur.execute(
            """
            SELECT complaint_id, status, assigned_officer_id
            FROM complaints
            WHERE complaint_id = %s
            FOR UPDATE
            """,
            (assignment["complaint_id"],),
        )
        complaint = cur.fetchone()
        if not complaint:
            conn.rollback()
            return jsonify({"error": "Complaint not found"}), 404

        previous_state = assignment["state"]
        allowed_states = transitions.get(previous_state, set())
        if new_state not in allowed_states:
            conn.rollback()
            return jsonify({
                "error": "Invalid assignment state transition",
                "currentState": previous_state,
                "requestedState": new_state,
                "allowedStates": sorted(allowed_states),
            }), 409

        # Values are fixed by the endpoint; client-supplied actor/role are never trusted.
        cur.execute(
            "SELECT set_config('civic_smart.current_actor', %s, true)",
            (actor,),
        )
        cur.execute(
            "SELECT set_config('civic_smart.current_role', %s, true)",
            (actor_role,),
        )

        update_parts = ["state = %s"]
        update_values = [new_state]
        if new_state == "REJECTED":
            update_parts.append("rejection_reason = %s")
            update_values.append(detail)
        elif new_state == "BLOCKED":
            update_parts.append("blocker = %s")
            update_values.append(detail)
        elif new_state == "COMPLETION_SUBMITTED":
            update_parts.append("completion_note = %s")
            update_values.append(detail)
        update_values.append(assignment_id)

        cur.execute(
            f"UPDATE assignments SET {', '.join(update_parts)} "
            "WHERE assignment_id = %s "
            "RETURNING assignment_id, complaint_id, officer_id, state, "
            "rejection_reason, blocker, completion_note, updated_at",
            tuple(update_values),
        )
        updated_assignment = cur.fetchone()

        cur.execute(
            """
            INSERT INTO assignment_history (
                assignment_id, complaint_id, officer_id, previous_state,
                new_state, actor, actor_role, detail
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                assignment["assignment_id"],
                assignment["complaint_id"],
                assignment["officer_id"],
                previous_state,
                new_state,
                actor,
                actor_role,
                detail,
            ),
        )

        complaint_status = {
            "IN_PROGRESS": "In Progress",
            "BLOCKED": "Blocked",
            "COMPLETION_SUBMITTED": "Completion Submitted",
            "REJECTED": "Verified",
        }.get(new_state)
        if complaint_status:
            if new_state == "REJECTED":
                cur.execute(
                    """
                    UPDATE complaints
                    SET status = %s, assigned_officer_id = NULL
                    WHERE complaint_id = %s
                    RETURNING status
                    """,
                    (complaint_status, assignment["complaint_id"]),
                )
            else:
                cur.execute(
                    """
                    UPDATE complaints
                    SET status = %s
                    WHERE complaint_id = %s
                    RETURNING status
                    """,
                    (complaint_status, assignment["complaint_id"]),
                )
            updated_complaint = cur.fetchone()
            complaint_status = updated_complaint["status"]
        else:
            complaint_status = complaint["status"]

        state_label = new_state.replace("_", " ").lower()
        notification_detail = f" Detail: {detail}" if detail else ""
        cur.execute(
            """
            INSERT INTO notifications (target_role, complaint_id, message)
            VALUES (%s, %s, %s)
            """,
            (
                "ADMIN",
                assignment["complaint_id"],
                f"Assignment {assignment_id} changed to {state_label}.{notification_detail}",
            ),
        )

        conn.commit()
        return jsonify({
            "ok": True,
            "assignment": {
                "id": updated_assignment["assignment_id"],
                "complaintId": updated_assignment["complaint_id"],
                "officerId": updated_assignment["officer_id"],
                "state": updated_assignment["state"],
                "rejectionReason": updated_assignment["rejection_reason"],
                "blocker": updated_assignment["blocker"],
                "completionNote": updated_assignment["completion_note"],
            },
            "complaintStatus": complaint_status,
        })
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/complaints/<cid>/allocate", methods=["POST"])
@require_roles("ADMIN")
@require_csrf
def allocate_officer(cid):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON object is required"}), 400

    officer_id = data.get("officerId", data.get("officer_id"))
    if not isinstance(officer_id, str) or not officer_id.strip():
        return jsonify({"error": "A valid officerId is required"}), 400

    clean_id = cid.upper().replace("#", "").strip()
    officer_id = officer_id.strip()
    actor = g.current_user["displayName"]
    conn = None
    cur = None

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "CALL public.sp_allocate_officer(%s, %s, %s)",
            (clean_id, officer_id, actor),
        )
        cur.execute(
            """
            SELECT
                a.assignment_id,
                a.complaint_id,
                a.officer_id,
                a.state,
                a.deadline,
                c.status AS complaint_status
            FROM public.assignments a
            JOIN public.complaints c ON c.complaint_id = a.complaint_id
            WHERE a.complaint_id = %s
              AND a.officer_id = %s
              AND a.state = 'PENDING_ACCEPTANCE'
            ORDER BY a.created_at DESC
            LIMIT 1
            """,
            (clean_id, officer_id),
        )
        assignment = cur.fetchone()
        if not assignment:
            raise RuntimeError("Allocation procedure returned without creating an assignment")

        conn.commit()
        deadline = assignment["deadline"]
        return jsonify({
            "ok": True,
            "assignment": {
                "id": assignment["assignment_id"],
                "complaintId": assignment["complaint_id"],
                "officerId": assignment["officer_id"],
                "state": assignment["state"],
                "deadline": deadline.isoformat() if hasattr(deadline, "isoformat") else deadline,
            },
            "complaintStatus": assignment["complaint_status"],
        }), 201
    except Exception as e:
        if conn:
            conn.rollback()
        sqlstate = getattr(e, "sqlstate", None) or getattr(e, "pgcode", None)
        if sqlstate == "P0002":
            return jsonify({"ok": False, "error": str(e).splitlines()[0]}), 404
        if sqlstate in {"P0001", "23505"}:
            return jsonify({"ok": False, "error": str(e).splitlines()[0]}), 409
        app.logger.exception("Officer allocation failed")
        return jsonify({"ok": False, "error": "Officer allocation failed"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/scheduler/aging", methods=["POST"])
@require_roles("ADMIN")
@require_csrf
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/scheduler/run", methods=["POST"])
@require_roles("ADMIN")
@require_csrf
def run_scheduler():
    actor = g.current_user["displayName"]

    try:
        conn = get_db_connection()
        cur = conn.cursor()

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

        decision = run_cpp_scheduler(eligible)
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

        cur.execute(
            """SELECT
                   a.officer_id,
                   a.capacity,
                   COUNT(asn.assignment_id) AS active_count
               FROM public.authorities a
               LEFT JOIN public.assignments asn
                   ON asn.officer_id = a.officer_id
                  AND asn.state IN (
                      'PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS',
                      'BLOCKED', 'COMPLETION_SUBMITTED'
                  )
               WHERE a.availability = 'Available'
                 AND (a.department = %s OR %s = ANY(a.skills))
                 AND (a.ward = %s OR %s = ANY(a.service_areas))
               GROUP BY a.officer_id, a.capacity
               HAVING COUNT(asn.assignment_id) < a.capacity
               ORDER BY active_count ASC, a.officer_id ASC
               LIMIT 1""",
            (
                still_eligible["department"],
                still_eligible["category"],
                still_eligible["ward"],
                still_eligible["ward"],
            ),
        )
        officer = cur.fetchone()
        if not officer:
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "NO_ELIGIBLE_OFFICER",
                "message": (
                    f"Scheduler selected {selected_id}, "
                    "but no eligible officer has available capacity."
                ),
                "selected": selected
            }), 409

        selected_officer_id = officer["officer_id"]
        app.logger.warning(
            "SCHEDULER DEBUG: database=%r complaint_id=%r officer_id=%r officer_type=%s",
            PGDATABASE,
            selected_id,
            selected_officer_id,
            type(selected_officer_id).__name__,
        )
        cur.execute(
            """SELECT
                   current_database() AS database_name,
                   current_user AS database_user,
                   officer_id,
                   length(officer_id) AS officer_id_length
               FROM public.authorities
               WHERE officer_id = %s""",
            (selected_officer_id,),
        )
        officer_check = cur.fetchone()
        app.logger.warning(
            "SCHEDULER DEBUG: same_connection_officer_check=%r",
            officer_check,
        )
        if not officer_check:
            raise RuntimeError(
                f"Scheduler selected officer ID {selected_officer_id!r}, "
                "but the same database connection cannot find it."
            )
        cur.execute(
            "CALL public.sp_allocate_officer(%s, %s, %s)",
            (selected_id, selected_officer_id, actor),
        )
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (selected_id,))
        updated = cur.fetchone()
        if not updated or not updated.get("assigned_officer_id"):
            conn.rollback()
            cur.close()
            conn.close()
            return jsonify({
                "ok": False,
                "reason": "ALLOCATION_NOT_CONFIRMED",
                "selected": selected
            }), 409
        conn.commit()

        cur.execute("SELECT * FROM assignments WHERE complaint_id = %s ORDER BY created_at DESC LIMIT 1", (selected_id,))
        assignment = cur.fetchone()
        cur.close()
        conn.close()

        return jsonify({
            "ok": True,
            "eligibleCount": decision.get("eligibleCount"),
            "policy": decision.get("policy"),
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
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/scheduler/mlq", methods=["GET"])
@require_roles("ADMIN")
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/audit", methods=["GET"])
@require_roles("ADMIN")
def get_audit():
    complaint_id = request.args.get("complaintId")
    query = """SELECT history_id as id, complaint_id as "complaintId", actor, role, action, 
                      from_status as "fromStatus", to_status as "toStatus", message, 
                      TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM status_history"""
    params = []
    if complaint_id:
        query += " WHERE complaint_id = %s"
        params.append(complaint_id)
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/notifications", methods=["GET"])
@require_roles("ADMIN")
def get_notifications():
    role = g.current_user["role"]
    query = """SELECT notification_id as id, target_role as "targetRole", complaint_id as "complaintId", 
                      message, is_read as read, TO_CHAR(created_at, 'Mon DD, YYYY HH12:MI AM') as timestamp 
               FROM notifications"""
    params = []
    if role:
        query += " WHERE target_role = %s"
        params.append(role)
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/analytics/overview", methods=["GET"])
@require_roles("ADMIN")
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
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print(f"========================================================")
    print(f" CIVIC SMART - PYTHON REST API BACKEND")
    print(f" Running on: http://localhost:{PORT}")
    print(f" Health check: http://localhost:{PORT}/api/health")
    print(f"========================================================")
    app.run(host="127.0.0.1", port=PORT, debug=False)
