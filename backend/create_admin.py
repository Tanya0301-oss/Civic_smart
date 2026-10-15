"""Create or reset an authority administrator account for local development."""

from getpass import getpass
from werkzeug.security import generate_password_hash

from app import get_db_connection


def main():
    username = input("Admin username: ").strip()
    password = getpass("Admin password (minimum 12 characters): ")
    if not username or len(username) > 100 or len(password) < 12:
        raise SystemExit("Enter a username and a password with at least 12 characters.")

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO app_users (username, password_hash, role)
           VALUES (%s, %s, 'ADMIN')
           ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash,
               is_active = TRUE WHERE app_users.role = 'ADMIN'
           RETURNING username""",
        (username, generate_password_hash(password))
    )
    if not cur.fetchone():
        conn.rollback()
        cur.close()
        conn.close()
        raise SystemExit("That username already belongs to a citizen or officer. Choose a different admin username.")
    conn.commit()
    cur.close()
    conn.close()
    print(f"Admin account '{username}' is ready.")


if __name__ == "__main__":
    main()
