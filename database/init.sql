-- Create users table
CREATE TABLE IF NOT EXISTS users (
                                     id INT AUTO_INCREMENT PRIMARY KEY,
                                     phone VARCHAR(15) NOT NULL UNIQUE,
    verification_code VARCHAR(6),
    is_verified BOOLEAN DEFAULT FALSE,
    has_played BOOLEAN DEFAULT FALSE,
    prize VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    played_at TIMESTAMP NULL,
    INDEX idx_phone (phone),
    INDEX idx_has_played (has_played)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create prizes_log table for tracking (optional)
CREATE TABLE IF NOT EXISTS prizes_log (
                                          id INT AUTO_INCREMENT PRIMARY KEY,
                                          user_id INT NOT NULL,
                                          phone VARCHAR(15) NOT NULL,
    prize VARCHAR(255) NOT NULL,
    won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_won_at (won_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;