-- =====================================================
-- آپدیت جوایز گردونه شانس
-- تطبیق با طراحی جدید
-- =====================================================

USE lucky_wheel;

-- پاک کردن جوایز قدیمی
DELETE FROM prizes where 1;

-- درج جوایز جدید مطابق تصویر
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

-- 1. 1.5 میلیون تومان نقد (احتمال 2%)
(
    '1.5 میلیون تومان',
    'cash-1.5m',
    'https://sarraf.com/prize',
    'https://cdn-icons-png.flaticon.com/512/2721/2721176.png',
    'دریافت جایزه',
    '🎉 تبریک! شما برنده 1.5 میلیون تومان نقد شدید! برای دریافت جایزه با پشتیبانی تماس بگیرید.',
    'CASH1.5M',
    0.0200,
    FALSE,
    1,
    TRUE
),

-- 2. گوشی موبایل (احتمال 3%)
(
    'گوشی موبایل',
    'mobile-phone',
    'https://sarraf.com/mobile',
    'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    'دریافت جایزه',
    '📱 عالی! شما برنده یک گوشی موبایل برند شدید!',
    'MOBILE2024',
    0.0300,
    FALSE,
    2,
    TRUE
),

-- 3. کارت هدیه 500 هزار تومان (احتمال 12%)
(
    'کارت ۵۰۰ هزار',
    'gift-card-500k',
    'https://sarraf.com/giftcard',
    'https://cdn-icons-png.flaticon.com/512/2917/2917995.png',
    'دریافت کارت هدیه',
    '💳 شما برنده کارت هدیه 500 هزار تومانی صراف شدید!',
    'GIFT500K',
    0.1200,
    FALSE,
    3,
    TRUE
),

-- 4. لپ‌تاپ گیمینگ (احتمال 5%)
(
    'لپ‌تاپ گیمینگ',
    'gaming-laptop',
    'https://sarraf.com/laptop',
    'https://cdn-icons-png.flaticon.com/512/2888/2888720.png',
    'مشاهده جایزه',
    '💻 فوق‌العاده! شما برنده یک لپ‌تاپ گیمینگ شدید!',
    'LAPTOP2024',
    0.0500,
    FALSE,
    4,
    TRUE
),

-- 5. هدفون (احتمال 8%)
(
    'هدفون',
    'headphone',
    'https://sarraf.com/headphone',
    'https://cdn-icons-png.flaticon.com/512/2504/2504814.png',
    'دریافت جایزه',
    '🎧 تبریک! شما برنده یک هدفون با کیفیت شدید!',
    'HEADPHONE24',
    0.0800,
    FALSE,
    5,
    TRUE
),

-- 6. 2 تلاش دیگر - پوچ (احتمال 15%)
(
    '۲ تلاش دیگر',
    'empty',
    NULL,
    'https://cdn-icons-png.flaticon.com/512/9195/9195825.png',
    'بستن',
    '😔 متاسفانه این بار برنده نشدید، اما می‌توانید دوباره شانس خود را امتحان کنید!',
    NULL,
    0.1500,
    TRUE,
    6,
    TRUE
),

-- 7. تخفیف 50 درصد (احتمال 20%)
(
    'تخفیف ۵۰٪',
    'discount-50',
    'https://sarraf.com/discount',
    'https://cdn-icons-png.flaticon.com/512/3225/3225160.png',
    'استفاده از تخفیف',
    '🎊 عالی! شما برنده کد تخفیف 50% شدید!',
    'DISCOUNT50',
    0.2000,
    FALSE,
    7,
    TRUE
),

-- 8. عضویت طلایی (احتمال 30%)
(
    'عضویت طلایی',
    'gold-membership',
    'https://sarraf.com/gold',
    'https://cdn-icons-png.flaticon.com/512/7422/7422080.png',
    'فعالسازی عضویت',
    '⭐ تبریک! شما برنده عضویت طلایی یک ساله صراف شدید!',
    'GOLD2024',
    0.3000,
    FALSE,
    8,
    TRUE
);

-- بررسی مجموع احتمالات
SELECT
    SUM(probability) as 'مجموع_احتمالات',
    CASE
        WHEN ABS(SUM(probability) - 1.0) < 0.001 THEN '✅ صحیح'
        ELSE '❌ نیاز به اصلاح'
        END as 'وضعیت'
FROM prizes
WHERE is_active = TRUE;

-- نمایش جوایز
SELECT
    id,
    name as 'نام_جایزه',
    english_name,
    CONCAT(ROUND(probability * 100, 2), '%') as 'احتمال',
    display_order as 'ترتیب',
    is_empty as 'پوچ',
    is_active as 'فعال'
FROM prizes
ORDER BY display_order;