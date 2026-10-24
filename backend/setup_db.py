"""
Civic Smart - Python PostgreSQL Migration & Seed Runner
Run: python setup_db.py
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PGHOST = os.getenv("PGHOST", "localhost")
PGPORT = int(os.getenv("PGPORT", 5432))
PGDATABASE = os.getenv("PGDATABASE", "civic_smartdb")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD", "postgres")

def run_setup():
    print("========================================================")
    print(" CIVIC SMART: POSTGRESQL DATABASE MIGRATION RUNNER (PYTHON)")
    print("========================================================")
    print(f"Connecting to {PGHOST}:{PGPORT}/{PGDATABASE} as {PGUSER}...")

    try:
        conn = psycopg2.connect(
            host=PGHOST,
            port=PGPORT,
            dbname=PGDATABASE,
            user=PGUSER,
            password=PGPASSWORD
        )
        conn.autocommit = True
        cur = conn.cursor()
        print("✓ Connected successfully!")

        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "database"))
        schema_path = os.path.join(base_dir, "schema.sql")
        seed_path = os.path.join(base_dir, "seed_data.sql")

        print(f"\n[1/2] Executing schema.sql from {schema_path}...")
        with open(schema_path, "r", encoding="utf-8") as f:
            cur.execute(f.read())
        print("✓ Schema applied successfully!")

        print(f"\n[2/2] Executing seed_data.sql from {seed_path}...")
        with open(seed_path, "r", encoding="utf-8") as f:
            cur.execute(f.read())
        print("✓ Seed data inserted successfully!")

        cur.execute("SELECT COUNT(*) FROM complaints")
        cnt = cur.fetchone()[0]
        print(f"\n✓ Verification: {cnt} complaints found in PostgreSQL.")

        cur.close()
        conn.close()
        print("\n========================================================")
        print(" DATABASE SETUP COMPLETED SUCCESSFULLY!")
        print(" You can now run: python app.py")
        print("========================================================\n")
    except Exception as e:
        print(f"\n❌ ERROR during database setup: {e}")

if __name__ == "__main__":
    run_setup()
