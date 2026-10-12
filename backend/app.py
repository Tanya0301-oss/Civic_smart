"""
Civic Smart - Python Flask REST API Backend
PostgreSQL DBMS Integration for Municipal Grievance & OS Scheduling
Works with standard Python installations and embedded PostgreSQL/pgAdmin Python.
"""

import os
import sys
import json
from datetime import datetime, timezone
from flask import Flask, request, jsonify, make_response

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
app = Flask(__name__, static_folder=ROOT_DIR, static_url_path="")

@app.route("/")
def index():
    return app.send_static_file("index.html")

# Built-in CORS support
try:
    from flask_cors import CORS
    CORS(app)
except ImportError:
    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
    @app.route("/<path:path>", methods=["OPTIONS"])
    def preflight_handler(path):
        resp = make_response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp

PORT = int(os.getenv("PORT", 5000))
PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", 5432))
PGDATABASE = os.getenv("PGDATABASE", "civic_smartdb")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")

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
                "error": str(e),
                "hint": "Check PGPASSWORD in backend/.env or ensure civic_smartdb exists."
            }
        }), 200

@app.route("/api/complaints", methods=["GET"])
def get_complaints():
    status = request.args.get("status")
    category = request.args.get("category")
    ward = request.args.get("ward")
    search = request.args.get("search")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []

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
def create_complaint():
    data = request.json or {}
    title = data.get("title")
    description = data.get("description")
    category = data.get("category")
    location = data.get("location")
    tehsil = data.get("tehsil", "Dehradun Sadar")
    ward = data.get("ward")
    severity = data.get("severity", "Medium")
    citizen = data.get("citizen", "Anonymous Citizen")
    photo = data.get("photo")

    if not all([title, description, category, location, ward]):
        return jsonify({"error": "Missing mandatory fields"}), 400

    dept_map = {
        "Roads": "Road Infrastructure & Maintenance",
        "Water": "Municipal Water & Sewerage Board",
        "Waste": "Solid Waste & Sanitation Department",
        "Lighting": "Electrical & Street Lighting Wing",
        "Drainage": "Stormwater Drainage Division",
        "Electricity": "Electrical & Street Lighting Wing",
        "Other": "General Municipal Works"
    }
    department = dept_map.get(category, "General Municipal Works")
    cluster_id = f"CLUS-{int(1000 + (abs(hash(title)) % 8999))}"

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) as count FROM complaints")
        cnt_row = cur.fetchone()
        cnt = cnt_row["count"] if isinstance(cnt_row, dict) else cnt_row[0]
        complaint_id = data.get("id") or f"CS{1001 + cnt}"

        cur.execute(
            """INSERT INTO complaints (
                complaint_id, citizen_name, title, description, category, department,
                location, tehsil, ward, severity, photo_url, cluster_id, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Reported')
            RETURNING *""",
            (complaint_id, citizen, title, description, category, department, location, tehsil, ward, severity, photo, cluster_id)
        )
        inserted = cur.fetchone()

        cur.execute(
            """INSERT INTO status_history (complaint_id, actor, role, action, from_status, to_status, message)
               VALUES (%s, %s, 'CITIZEN', 'Complaint Registered', '', 'Reported', 'Citizen report stored in PostgreSQL.')""",
            (complaint_id, citizen)
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/complaints/<cid>/status", methods=["PATCH", "PUT"])
@app.route("/api/complaints/<cid>", methods=["PUT", "PATCH"])
def update_status(cid):
    clean_id = cid.upper().replace("#", "").strip()
    data = request.json or {}
    status = data.get("status")
    actor = data.get("actor", "Authority Console")
    role = data.get("role", "ADMIN")

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
def get_assignments():
    officer_id = request.args.get("officerId")
    complaint_id = request.args.get("complaintId")
    query = "SELECT * FROM assignments WHERE 1=1"
    params = []
    if officer_id:
        query += " AND officer_id = %s"
        params.append(officer_id)
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
        return jsonify({"error": str(e)}), 500

@app.route("/api/complaints/<cid>/allocate", methods=["POST"])
def allocate_officer(cid):
    clean_id = cid.upper().replace("#", "").strip()
    data = request.json or {}
    actor = data.get("actor", "Authority Console")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("CALL sp_allocate_officer(%s, %s)", (clean_id, actor))
        conn.commit()
        cur.execute("SELECT * FROM complaints WHERE complaint_id = %s", (clean_id,))
        updated = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({"ok": True, "complaint": map_complaint(updated)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/api/scheduler/aging", methods=["POST"])
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

@app.route("/api/scheduler/mlq", methods=["GET"])
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
def get_notifications():
    role = request.args.get("role")
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
    app.run(host="0.0.0.0", port=PORT, debug=False)
