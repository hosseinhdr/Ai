-- Create prizes table
CREATE TABLE IF NOT EXISTS prizes (
                                      id INT AUTO_INCREMENT PRIMARY KEY,
                                      name VARCHAR(255) NOT NULL COMMENT 'نام جایزه برای نمایش در گردونه',
    link VARCHAR(500) COMMENT 'لینک جایزه',
    image VARCHAR(500) COMMENT 'آدرس عکس جایزه',
    button_text VARCHAR(100) COMMENT 'متن دکمه',
    prize_text TEXT COMMENT 'متن توضیحات جایزه',
    code VARCHAR(100) COMMENT 'کد جایزه',
    probability DECIMAL(5,4) DEFAULT 0.1 COMMENT 'احتمال برنده شدن',
    is_empty BOOLEAN DEFAULT FALSE COMMENT 'آیا جایزه پوچ است',
    display_order INT DEFAULT 0 COMMENT 'ترتیب نمایش در گردونه',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'فعال/غیرفعال',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample prizes
INSERT INTO prizes (name, link, image, button_text, prize_text, code, probability, is_empty, display_order) VALUES
                                                                                                                ('iPhone 15 Pro', 'https://www.apple.com/iphone-15-pro/', '/images/prizes/iphone.jpg', 'دریافت جایزه', 'شما برنده یک دستگاه iPhone 15 Pro شدید!', 'IPHONE2024', 0.02, FALSE, 1),
                                                                                                                ('لپ‌تاپ گیمینگ', 'https://example.com/laptop', '/images/prizes/laptop.jpg', 'مشاهده جایزه', 'تبریک! شما برنده یک لپ‌تاپ گیمینگ ASUS ROG شدید', 'LAPTOP2024', 0.03, FALSE, 2),
                                                                                                                ('کارت هدیه 500هزار', 'https://example.com/gift500', '/images/prizes/gift500.jpg', 'دریافت کارت هدیه', 'کارت هدیه 500 هزار تومانی برای خرید از صراف', 'GIFT500K', 0.15, FALSE, 3),
                                                                                                                ('عضویت طلایی', 'https://example.com/gold', '/images/prizes/gold.jpg', 'فعالسازی عضویت', 'عضویت طلایی یک ساله در صراف', 'GOLD2024', 0.20, FALSE, 4),
                                                                                                                ('کارت هدیه 100هزار', 'https://example.com/gift100', '/images/prizes/gift100.jpg', 'دریافت کارت هدیه', 'کارت هدیه 100 هزار تومانی', 'GIFT100K', 0.25, FALSE, 5),
                                                                                                                ('پوچ', NULL, '/images/prizes/empty.jpg', 'تلاش مجدد', 'متاسفانه این بار برنده نشدید', NULL, 0.10, TRUE, 6),
                                                                                                                ('تخفیف 50%', 'https://example.com/discount', '/images/prizes/discount.jpg', 'استفاده از تخفیف', 'کد تخفیف 50% برای خرید بعدی', 'DISCOUNT50', 0.20, FALSE, 7),
                                                                                                                ('هدفون بلوتوث', 'https://example.com/headphone', '/images/prizes/headphone.jpg', 'دریافت جایزه', 'هدفون بلوتوث JBL', 'HEADPHONE24', 0.05, FALSE, 8);

-- Create index for better performance
CREATE INDEX idx_prizes_active ON prizes(is_active);
CREATE INDEX idx_prizes_order ON prizes(display_order);

-- Update users table to store prize_id instead of prize name
ALTER TABLE users
    ADD COLUMN prize_id INT,
ADD CONSTRAINT fk_user_prize FOREIGN KEY (prize_id) REFERENCES prizes(id);


-- ابتدا جدول رو خالی می‌کنیم
TRUNCATE TABLE prizes;

-- درج دیتای کامل جوایز با لینک عکس‌ها
INSERT INTO prizes (name, link, image, button_text, prize_text, code, probability, is_empty, display_order, is_active) VALUES

-- 1. iPhone 15 Pro
('iPhone 15 Pro',
 'https://www.apple.com/iphone-15-pro/',
 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch-bluetitanium?wid=400&hei=400&fmt=jpeg&qlt=90',
 'دریافت جایزه',
 '🎉 تبریک! شما برنده یک دستگاه iPhone 15 Pro شدید! برای دریافت جایزه با پشتیبانی تماس بگیرید.',
 'IPHONE2024',
 0.02,
 FALSE,
 1,
 TRUE),

-- 2. لپ‌تاپ گیمینگ ASUS ROG
('لپ‌تاپ گیمینگ ASUS',
 'https://rog.asus.com/',
 'https://dlcdnwebimgs.asus.com/gain/FA617NS-N3085W/w400',
 'مشاهده جایزه',
 '🎮 عالی! شما برنده یک لپ‌تاپ گیمینگ ASUS ROG Strix شدید! قدرت گیمینگ در دستان شما!',
 'LAPTOP2024',
 0.03,
 FALSE,
 2,
 TRUE),

-- 3. کارت هدیه 500 هزار تومان
('کارت هدیه ۵۰۰ هزار',
 'https://sarraf.com/giftcard',
 'https://cdn-icons-png.flaticon.com/512/612/612886.png',
 'دریافت کارت هدیه',
 '💳 شما برنده کارت هدیه 500 هزار تومانی صراف شدید! از کد زیر برای خرید استفاده کنید.',
 'GIFT500K',
 0.15,
 FALSE,
 3,
 TRUE),

-- 4. عضویت طلایی یک ساله
('عضویت طلایی',
 'https://sarraf.com/gold-membership',
 'https://cdn-icons-png.flaticon.com/512/3112/3112946.png',
 'فعالسازی عضویت',
 '⭐ تبریک! شما برنده عضویت طلایی یک ساله صراف شدید. از مزایای ویژه لذت ببرید!',
 'GOLD2024',
 0.20,
 FALSE,
 4,
 TRUE),

-- 5. کارت هدیه 100 هزار تومان
('کارت هدیه ۱۰۰ هزار',
 'https://sarraf.com/giftcard',
 'https://cdn-icons-png.flaticon.com/512/3050/3050158.png',
 'دریافت کارت هدیه',
 '🎁 شما برنده کارت هدیه 100 هزار تومانی شدید! کد تخفیف را کپی کنید.',
 'GIFT100K',
 0.25,
 FALSE,
 5,
 TRUE),

-- 6. پوچ (بدون جایزه)
('دوباره تلاش کن',
 NULL,
 'https://cdn-icons-png.flaticon.com/512/6659/6659895.png',
 'بستن',
 '😔 متاسفانه این بار برنده نشدید. اما ناامید نشوید، شانس خود را دوباره امتحان کنید!',
 NULL,
 0.10,
 TRUE,
 6,
 TRUE),

-- 7. تخفیف 50 درصد
('تخفیف ۵۰٪',
 'https://sarraf.com/discount',
 'https://cdn-icons-png.flaticon.com/512/3176/3176371.png',
 'استفاده از تخفیف',
 '🎊 عالی! شما برنده کد تخفیف 50% برای خرید بعدی شدید. این کد تا 30 روز اعتبار دارد.',
 'DISCOUNT50',
 0.20,
 FALSE,
 7,
 TRUE),

-- 8. هدفون بلوتوث JBL
('هدفون JBL',
 'https://www.jbl.com/',
 'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw89ae67f1/JBL_Tune_510BT_Product_Image_Hero_Blue.png?sw=400&sh=400',
 'دریافت جایزه',
 '🎧 تبریک! شما برنده هدفون بلوتوث JBL Tune 510BT شدید! موسیقی را با کیفیت عالی بشنوید.',
 'HEADPHONE24',
 0.05,
 FALSE,
 8,
 TRUE);

-- بررسی دیتای وارد شده
SELECT id, name, image, code, probability, is_empty, display_order
FROM prizes
ORDER BY display_order;

-- بررسی مجموع احتمالات (باید 1.00 باشد)
SELECT SUM(probability) as total_probability FROM prizes WHERE is_active = TRUE;