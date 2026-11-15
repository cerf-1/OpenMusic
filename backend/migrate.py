"""Apply versioned, restart-safe MariaDB DDL: python backend/migrate.py."""
from pathlib import Path
from database import database


def migrate():
    with database() as cursor:
        cursor.execute("SELECT GET_LOCK('openmusic_migrations', 15) AS locked")
        if cursor.fetchone()['locked'] != 1:
            raise RuntimeError('Migration lock unavailable')
        try:
            cursor.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(128) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB')
            for path in sorted(Path(__file__).with_name('migrations').glob('*.sql')):
                cursor.execute('SELECT version FROM schema_migrations WHERE version=%s', (path.name,))
                if cursor.fetchone():
                    continue
                for statement in path.read_text().split(';'):
                    if statement.strip():
                        cursor.execute(statement)
                cursor.execute('INSERT INTO schema_migrations (version) VALUES (%s)', (path.name,))
                print('Applied', path.name)
            # Keep the advisory lock until the version rows are visible to other runners.
            cursor.connection.commit()
        finally:
            cursor.execute("SELECT RELEASE_LOCK('openmusic_migrations')")


if __name__ == '__main__':
    migrate()
