CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 telegram_issuer VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 telegram_subject VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 name VARCHAR(256) NOT NULL,
 username VARCHAR(128) NULL,
 avatar VARCHAR(2048) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY telegram_identity (telegram_issuer, telegram_subject)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash BINARY(32) NOT NULL PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 csrf_token CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 KEY session_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash BINARY(32) NOT NULL PRIMARY KEY,
 browser_hash BINARY(32) NOT NULL,
 verifier VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 KEY oauth_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS likes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 type ENUM('track','album') NOT NULL,
 source VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 title VARCHAR(300) NOT NULL,
 artist VARCHAR(300) NOT NULL,
 cover VARCHAR(2048) NULL,
 duration_seconds INT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 UNIQUE KEY like_identity (user_id, type, source, source_id),
 KEY likes_user_type_date (user_id, type, created_at, id),
 CONSTRAINT valid_source CHECK ((type='track' AND source IN ('demo','youtube')) OR (type='album' AND source='demo'))
) ENGINE=InnoDB;
