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

-- اضافه کردن فیلدهای UTM به جدول users (با NULL به جای مقدار پیش‌فرض)
ALTER TABLE users
    ADD COLUMN utm_source VARCHAR(255) NULL AFTER played_at,
    ADD COLUMN utm_medium VARCHAR(255) NULL AFTER utm_source,
    ADD COLUMN utm_campaign VARCHAR(255) NULL AFTER utm_medium,
    ADD INDEX idx_utm_source (utm_source),
    ADD INDEX idx_utm_medium (utm_medium),
    ADD INDEX idx_utm_campaign (utm_campaign);

-- اضافه کردن فیلد english_name به جدول prizes
ALTER TABLE prizes
    ADD COLUMN english_name VARCHAR(255) NULL AFTER name,
    ADD INDEX idx_english_name (english_name);

-- آپدیت نام انگلیسی جوایز موجود
UPDATE prizes SET english_name = CASE
                                     WHEN id = 1 THEN 'iphone15pro'
                                     WHEN id = 2 THEN 'asus-gaming-laptop'
                                     WHEN id = 3 THEN 'gift-card-500k'
                                     WHEN id = 4 THEN 'gold-membership'
                                     WHEN id = 5 THEN 'gift-card-100k'
                                     WHEN id = 6 THEN 'empty'
                                     WHEN id = 7 THEN 'discount-50'
                                     WHEN id = 8 THEN 'jbl-headphone'
                                     ELSE LOWER(REPLACE(REPLACE(name, ' ', '-'), 'ی', 'i'))
    END WHERE english_name IS NULL;