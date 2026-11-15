"""Short, bounded MariaDB transactions, independent of the music resolver."""
import os
from contextlib import contextmanager
import pymysql
import settings  # Load the project .env for direct migration runs.


@contextmanager
def database():
    connection = pymysql.connect(
        host=os.getenv('DB_HOST', '127.0.0.1'), port=int(os.getenv('DB_PORT', '3306')),
        user=os.getenv('DB_USER', 'openmusic'), password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'openmusic'), charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor, connect_timeout=3, read_timeout=5,
        write_timeout=5, init_command="SET time_zone = '+00:00'",
    )
    try:
        with connection.cursor() as cursor:
            yield cursor
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()
