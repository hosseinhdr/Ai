-- =====================================================
-- گردونه شانس صراف - Database Schema
-- Version: 2.0
-- Last Updated: January 2025
-- =====================================================

-- حذف دیتابیس قدیمی (اختیاری - برای محیط توسعه)
-- DROP DATABASE IF EXISTS lucky_wheel;

-- ایجاد دیتابیس
CREATE DATABASE IF NOT EXISTS lucky_wheel
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE lucky_wheel;

-- =====================================================
-- جدول کاربران (Users)
-- =====================================================
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    -- فیلدهای اصلی
                       id INT AUTO_INCREMENT PRIMARY KEY,
                       phone VARCHAR(15) NOT NULL UNIQUE COMMENT 'شماره موبایل کاربر',
                       verification_code VARCHAR(6) NULL COMMENT 'کد تایید پیامکی',

    -- وضعیت کاربر
                       is_verified BOOLEAN DEFAULT FALSE COMMENT 'آیا شماره تایید شده',
                       has_played BOOLEAN DEFAULT FALSE COMMENT 'آیا در گردونه شرکت کرده',

    -- اطلاعات جایزه
                       prize VARCHAR(255) NULL COMMENT 'نام جایزه (برای سازگاری با نسخه قدیم)',
                       prize_id INT NULL COMMENT 'شناسه جایزه از جدول prizes',

    -- فیلدهای UTM (فقط اگر کاربر با لینک UTM آمده باشد)
                       utm_source VARCHAR(255) NULL COMMENT 'منبع ورود (مثل telegram, instagram)',
                       utm_medium VARCHAR(255) NULL COMMENT 'نوع کانال (مثل social, email)',
                       utm_campaign VARCHAR(255) NULL COMMENT 'نام کمپین',

    -- تاریخ‌ها
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاریخ ثبت‌نام',
                       played_at TIMESTAMP NULL COMMENT 'تاریخ شرکت در گردونه',

    -- Indexes
                       INDEX idx_phone (phone),
                       INDEX idx_has_played (has_played),
                       INDEX idx_is_verified (is_verified),
                       INDEX idx_prize_id (prize_id),
                       INDEX idx_utm_source (utm_source),
                       INDEX idx_utm_medium (utm_medium),
                       INDEX idx_utm_campaign (utm_campaign),
                       INDEX idx_created_at (created_at),
                       INDEX idx_played_at (played_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='جدول کاربران شرکت‌کننده در گردونه';

-- =====================================================
-- جدول جوایز (Prizes)
-- =====================================================
DROP TABLE IF EXISTS prizes;

CREATE TABLE prizes (
    -- فیلدهای اصلی
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(255) NOT NULL COMMENT 'نام فارسی جایزه برای نمایش در گردونه',
                        english_name VARCHAR(255) NULL COMMENT 'نام انگلیسی جایزه برای utm_content',

    -- اطلاعات نمایشی
                        link VARCHAR(500) NULL COMMENT 'لینک جایزه (برای redirect کاربر)',
                        image VARCHAR(500) NULL COMMENT 'آدرس تصویر جایزه',
                        button_text VARCHAR(100) DEFAULT 'دریافت جایزه' COMMENT 'متن دکمه در modal',
                        prize_text TEXT NULL COMMENT 'توضیحات جایزه که به کاربر نمایش داده می‌شود',
                        code VARCHAR(100) NULL COMMENT 'کد جایزه (مثل کد تخفیف)',

    -- تنظیمات احتمال و نمایش
                        probability DECIMAL(5,4) DEFAULT 0.1000 COMMENT 'احتمال برنده شدن (0 تا 1)',
                        is_empty BOOLEAN DEFAULT FALSE COMMENT 'آیا جایزه پوچ است (بدون جایزه)',
                        display_order INT DEFAULT 0 COMMENT 'ترتیب نمایش در گردونه (1 تا 8)',

    -- وضعیت
                        is_active BOOLEAN DEFAULT TRUE COMMENT 'فعال/غیرفعال بودن جایزه',

    -- تاریخ‌ها
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Indexes
                        INDEX idx_is_active (is_active),
                        INDEX idx_display_order (display_order),
                        INDEX idx_english_name (english_name),
                        INDEX idx_probability (probability)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='جدول جوایز گردونه';

-- =====================================================
-- جدول لاگ جوایز (Prize Logs)
-- =====================================================
DROP TABLE IF EXISTS prizes_log;

CREATE TABLE prizes_log (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            user_id INT NOT NULL COMMENT 'شناسه کاربر برنده',
                            phone VARCHAR(15) NOT NULL COMMENT 'شماره تماس برنده',
                            prize VARCHAR(255) NOT NULL COMMENT 'نام جایزه',
                            won_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'زمان برنده شدن',

    -- Foreign Key
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    -- Indexes
                            INDEX idx_user_id (user_id),
                            INDEX idx_won_at (won_at),
                            INDEX idx_phone (phone)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='لاگ تمام برندگان جوایز';

-- =====================================================
-- Foreign Key برای ارتباط users با prizes
-- =====================================================
ALTER TABLE users
    ADD CONSTRAINT fk_user_prize
        FOREIGN KEY (prize_id) REFERENCES prizes(id)
            ON DELETE SET NULL;

-- =====================================================
-- درج دیتای اولیه جوایز
-- =====================================================
INSERT INTO prizes (
    name,
    english_name,
    link,
    image,
    button_text,
    prize_text,
    code,
    probability,
    is_empty,
    display_order,
    is_active
) VALUES

-- 1. iPhone 15 Pro (احتمال 2%)
(
    'iPhone 15 Pro',
    'iphone-15-pro',
    'https://www.apple.com/iphone-15-pro/',
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch-bluetitanium?wid=400&hei=400&fmt=jpeg&qlt=90',
    'دریافت جایزه',
    '🎉 تبریک! شما برنده یک دستگاه iPhone 15 Pro شدید! برای دریافت جایزه با پشتیبانی تماس بگیرید.',
    'IPHONE2024',
    0.0200,
    FALSE,
    1,
    TRUE
),

-- 2. لپ‌تاپ گیمینگ ASUS (احتمال 3%)
(
    'لپ‌تاپ گیمینگ ASUS',
    'asus-gaming-laptop',
    'https://rog.asus.com/',
    'https://dlcdnwebimgs.asus.com/gain/FA617NS-N3085W/w400',
    'مشاهده جایزه',
    '🎮 عالی! شما برنده یک لپ‌تاپ گیمینگ ASUS ROG Strix شدید! قدرت گیمینگ در دستان شما!',
    'LAPTOP2024',
    0.0300,
    FALSE,
    2,
    TRUE
),

-- 3. کارت هدیه 500 هزار تومان (احتمال 15%)
(
    'کارت هدیه ۵۰۰ هزار',
    'gift-card-500k',
    'https://sarraf.com/giftcard',
    'https://cdn-icons-png.flaticon.com/512/612/612886.png',
    'دریافت کارت هدیه',
    '💳 شما برنده کارت هدیه 500 هزار تومانی صراف شدید! از کد زیر برای خرید استفاده کنید.',
    'GIFT500K',
    0.1500,
    FALSE,
    3,
    TRUE
),

-- 4. عضویت طلایی یک ساله (احتمال 20%)
(
    'عضویت طلایی',
    'gold-membership',
    'https://sarraf.com/gold-membership',
    'https://cdn-icons-png.flaticon.com/512/3112/3112946.png',
    'فعالسازی عضویت',
    '⭐ تبریک! شما برنده عضویت طلایی یک ساله صراف شدید. از مزایای ویژه لذت ببرید!',
    'GOLD2024',
    0.2000,
    FALSE,
    4,
    TRUE
),

-- 5. کارت هدیه 100 هزار تومان (احتمال 25%)
(
    'کارت هدیه ۱۰۰ هزار',
    'gift-card-100k',
    'https://sarraf.com/giftcard',
    'https://cdn-icons-png.flaticon.com/512/3050/3050158.png',
    'دریافت کارت هدیه',
    '🎁 شما برنده کارت هدیه 100 هزار تومانی شدید! کد تخفیف را کپی کنید.',
    'GIFT100K',
    0.2500,
    FALSE,
    5,
    TRUE
),

-- 6. پوچ - بدون جایزه (احتمال 10%)
(
    'دوباره تلاش کن',
    'empty',
    NULL,
    'https://cdn-icons-png.flaticon.com/512/6659/6659895.png',
    'بستن',
    '😔 متاسفانه این بار برنده نشدید. اما ناامید نشوید، شانس خود را دوباره امتحان کنید!',
    NULL,
    0.1000,
    TRUE,
    6,
    TRUE
),

-- 7. تخفیف 50 درصد (احتمال 20%)
(
    'تخفیف ۵۰٪',
    'discount-50',
    'https://sarraf.com/discount',
    'https://cdn-icons-png.flaticon.com/512/3176/3176371.png',
    'استفاده از تخفیف',
    '🎊 عالی! شما برنده کد تخفیف 50% برای خرید بعدی شدید. این کد تا 30 روز اعتبار دارد.',
    'DISCOUNT50',
    0.2000,
    FALSE,
    7,
    TRUE
),

-- 8. هدفون بلوتوث JBL (احتمال 5%)
(
    'هدفون JBL',
    'jbl-headphone',
    'https://www.jbl.com/',
    'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw89ae67f1/JBL_Tune_510BT_Product_Image_Hero_Blue.png?sw=400&sh=400',
    'دریافت جایزه',
    '🎧 تبریک! شما برنده هدفون بلوتوث JBL Tune 510BT شدید! موسیقی را با کیفیت عالی بشنوید.',
    'HEADPHONE24',
    0.0500,
    FALSE,
    8,
    TRUE
);

-- =====================================================
-- بررسی مجموع احتمالات (باید 1.00 باشد)
-- =====================================================
SELECT
    SUM(probability) as 'مجموع_احتمالات',
    CASE
        WHEN ABS(SUM(probability) - 1.0) < 0.001 THEN '✅ صحیح'
        ELSE '❌ نیاز به اصلاح'
        END as 'وضعیت'
FROM prizes
WHERE is_active = TRUE;

-- =====================================================
-- نمای آماری جوایز
-- =====================================================
CREATE OR REPLACE VIEW prize_statistics AS
SELECT
    p.id,
    p.name as 'نام_جایزه',
    p.english_name as 'نام_انگلیسی',
    p.code as 'کد',
    CONCAT(ROUND(p.probability * 100, 2), '%') as 'احتمال',
    p.is_active as 'فعال',
    COUNT(u.id) as 'تعداد_برندگان',
    p.display_order as 'ترتیب_نمایش'
FROM prizes p
         LEFT JOIN users u ON p.id = u.prize_id
GROUP BY p.id
ORDER BY p.display_order;

-- =====================================================
-- نمای آماری کاربران
-- =====================================================
CREATE OR REPLACE VIEW user_statistics AS
SELECT
    COUNT(*) as 'کل_کاربران',
    SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as 'تایید_شده',
    SUM(CASE WHEN has_played = 1 THEN 1 ELSE 0 END) as 'شرکت_کرده',
    SUM(CASE WHEN utm_source IS NOT NULL THEN 1 ELSE 0 END) as 'با_UTM',
    COUNT(DISTINCT utm_source) as 'تعداد_منابع',
    COUNT(DISTINCT utm_campaign) as 'تعداد_کمپین'
FROM users;

-- =====================================================
-- پایان اسکریپت
-- =====================================================