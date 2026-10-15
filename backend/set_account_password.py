"""Set a local demo citizen or officer password using a modern Werkzeug hash."""

from getpass import getpass
from werkzeug.security import generate_password_hash

from app import get_db_connection


def main():
    username = input("Account username (citizen phone or officer ID): ").strip()
    password = getpass("New password (minimum 12 characters): ")
    if not username or len(password) < 12:
        raise SystemExit("Enter a username and a password with at least 12 characters.")

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """UPDATE app_users SET password_hash = %s, is_active = TRUE
           WHERE LOWER(username) = LOWER(%s) AND role IN ('CITIZEN', 'OFFICER')
           RETURNING username, role""",
        (generate_password_hash(password), username)
    )
    account = cur.fetchone()
    if not account:
        conn.rollback()
        raise SystemExit("No citizen or officer login exists for that username. Run schema.sql and seed_data.sql first.")
    conn.commit()
    cur.close()
    conn.close()
    print(f"Password updated for {account['role'].lower()} account '{account['username']}'.")


if __name__ == "__main__":
    main()
