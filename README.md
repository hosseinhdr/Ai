# 📊 راهنمای مدیریت احتمالات گردونه شانس

## فهرست مطالب
- [مفهوم Probability](#مفهوم-probability)
- [نحوه کارکرد](#نحوه-کارکرد)
- [استراتژی‌های تنظیم](#استراتژی‌های-تنظیم)
- [دستورات SQL](#دستورات-sql)
- [نکات مهم](#نکات-مهم)

---

## 🎯 مفهوم Probability

`probability` فیلدی در جدول `prizes` است که **احتمال برنده شدن** هر جایزه را مشخص می‌کند.

| مقدار | معنی | درصد |
|-------|------|------|
| 0.00 | هرگز برنده نمی‌شود | 0% |
| 0.01 | خیلی سخت | 1% |
| 0.10 | سخت | 10% |
| 0.25 | متوسط | 25% |
| 0.50 | آسان | 50% |
| 1.00 | همیشه برنده می‌شود | 100% |

### ⚠️ قانون طلایی
```
مجموع تمام probability ها باید = 1.00 باشد
```

---

## 🎰 نحوه کارکرد

### الگوریتم انتخاب جایزه:

1. **تولید عدد رندوم**: سیستم عددی بین 0 تا 1 تولید می‌کند
2. **محاسبه تجمعی**: احتمالات را از اول جمع می‌کند
3. **انتخاب جایزه**: اولین جایزه‌ای که مجموع تجمعی از عدد رندوم بیشتر شد، برنده است

### مثال عملی:
```
عدد رندوم: 0.43

جایزه 1 (prob=0.10): مجموع=0.10 → 0.43 > 0.10 ❌
جایزه 2 (prob=0.20): مجموع=0.30 → 0.43 > 0.30 ❌  
جایزه 3 (prob=0.15): مجموع=0.45 → 0.43 < 0.45 ✅ برنده!
```

---

## 📈 استراتژی‌های تنظیم

### 1️⃣ استراتژی محافظه‌کارانه (کم‌ضرر)
```sql
-- جوایز گران: احتمال خیلی کم
-- جوایز ارزان: احتمال زیاد
UPDATE prizes SET probability = CASE 
    WHEN name LIKE '%iPhone%' THEN 0.001      -- 0.1%
    WHEN name LIKE '%لپ‌تاپ%' THEN 0.002      -- 0.2%
    WHEN name LIKE '%500%' THEN 0.05          -- 5%
    WHEN name LIKE '%100%' THEN 0.147         -- 14.7%
    WHEN name LIKE '%طلایی%' THEN 0.20        -- 20%
    WHEN name LIKE '%تخفیف%' THEN 0.30        -- 30%
    WHEN name LIKE '%تلاش%' THEN 0.30         -- 30% (پوچ)
    ELSE 0.10
END WHERE is_active = TRUE;
```

### 2️⃣ استراتژی متعادل (پیشنهادی)
```sql
-- تعادل بین هیجان و سودآوری
UPDATE prizes SET probability = CASE 
    WHEN name LIKE '%iPhone%' THEN 0.02       -- 2%
    WHEN name LIKE '%لپ‌تاپ%' THEN 0.03       -- 3%
    WHEN name LIKE '%هدفون%' THEN 0.05       -- 5%
    WHEN name LIKE '%500%' THEN 0.15          -- 15%
    WHEN name LIKE '%100%' THEN 0.25          -- 25%
    WHEN name LIKE '%طلایی%' THEN 0.20        -- 20%
    WHEN name LIKE '%تخفیف%' THEN 0.20        -- 20%
    WHEN name LIKE '%تلاش%' THEN 0.10         -- 10% (پوچ)
END WHERE is_active = TRUE;
```

### 3️⃣ استراتژی سخاوتمندانه (جذب کاربر)
```sql
-- احتمال بالای جوایز خوب
UPDATE prizes SET probability = CASE 
    WHEN name LIKE '%iPhone%' THEN 0.05       -- 5%
    WHEN name LIKE '%لپ‌تاپ%' THEN 0.10       -- 10%
    WHEN name LIKE '%هدفون%' THEN 0.15       -- 15%
    WHEN name LIKE '%500%' THEN 0.20          -- 20%
    WHEN name LIKE '%100%' THEN 0.20          -- 20%
    WHEN name LIKE '%طلایی%' THEN 0.15        -- 15%
    WHEN name LIKE '%تخفیف%' THEN 0.10        -- 10%
    WHEN name LIKE '%تلاش%' THEN 0.05         -- 5% (پوچ)
END WHERE is_active = TRUE;
```

### 4️⃣ استراتژی عادلانه
```sql
-- همه جوایز شانس برابر
UPDATE prizes 
SET probability = 1.0 / (SELECT COUNT(*) FROM prizes WHERE is_active = TRUE)
WHERE is_active = TRUE;
```

---

## 💻 دستورات SQL

### بررسی وضعیت فعلی
```sql
-- نمایش احتمالات فعلی
SELECT 
    id,
    name as 'نام جایزه',
    probability as 'احتمال',
    ROUND(probability * 100, 2) as 'درصد %',
    ROUND(probability * 1000) as 'از 1000 بار'
FROM prizes 
WHERE is_active = TRUE
ORDER BY probability DESC;

-- بررسی مجموع
SELECT SUM(probability) as 'مجموع (باید 1.00 باشد)' 
FROM prizes 
WHERE is_active = TRUE;
```

### تغییر احتمالات
```sql
-- روش 1: تغییر تکی
UPDATE prizes SET probability = 0.15 WHERE id = 3;

-- روش 2: تغییر گروهی
UPDATE prizes SET probability = CASE 
    WHEN id = 1 THEN 0.01
    WHEN id = 2 THEN 0.02
    WHEN id = 3 THEN 0.17
    WHEN id = 4 THEN 0.20
    WHEN id = 5 THEN 0.25
    WHEN id = 6 THEN 0.15
    WHEN id = 7 THEN 0.15
    WHEN id = 8 THEN 0.05
END WHERE is_active = TRUE;
```

### نرمال‌سازی خودکار
```sql
-- اگر مجموع ≠ 1.00 است
UPDATE prizes p1
SET probability = probability / (
    SELECT SUM(probability) 
    FROM (SELECT * FROM prizes) p2 
    WHERE p2.is_active = TRUE
)
WHERE is_active = TRUE;
```

### شبیه‌سازی نتایج
```sql
-- پیش‌بینی نتایج در 10000 بار چرخش
SELECT 
    name as 'جایزه',
    CONCAT(ROUND(probability * 100, 1), '%') as 'احتمال',
    ROUND(probability * 10000) as 'برد در 10000 بار',
    CASE 
        WHEN probability < 0.01 THEN '🔴 خیلی نادر'
        WHEN probability < 0.05 THEN '🟠 نادر'
        WHEN probability < 0.15 THEN '🟡 کم'
        WHEN probability < 0.25 THEN '🟢 متوسط'
        ELSE '🔵 زیاد'
    END as 'دسته‌بندی'
FROM prizes 
WHERE is_active = TRUE
ORDER BY probability ASC;
```

---

## 📌 نکات مهم

### ✅ قبل از تغییر
1. **بک‌آپ بگیرید**: `SELECT * FROM prizes INTO OUTFILE 'backup.csv';`
2. **محاسبه کنید**: مجموع جدید را محاسبه کنید
3. **تست کنید**: ابتدا در محیط تست امتحان کنید

### ⚠️ اشتباهات رایج
- ❌ فراموش کردن چک مجموع = 1.00
- ❌ استفاده از اعداد بزرگتر از 1
- ❌ احتمال 0 برای جایزه فعال
- ❌ تغییر probability بدون در نظر گرفتن بقیه جوایز

### 💡 توصیه‌ها
- جوایز گران‌قیمت: `0.001 - 0.05`
- جوایز متوسط: `0.10 - 0.20`
- جوایز ارزان: `0.20 - 0.35`
- پوچ: براساس استراتژی `0.05 - 0.30`

---

## 📊 فرمول‌های کاربردی

### محاسبه تعداد برندگان
```
تعداد برندگان = تعداد کل بازی‌ها × probability
```

### محاسبه هزینه کمپین
```
هزینه = Σ(ارزش جایزه × probability × تعداد بازی‌کنندگان)
```

### محاسبه ROI
```
ROI = (درآمد - هزینه جوایز) / هزینه جوایز × 100
```

---

## 🚀 مثال عملی کامل

```sql
-- 1. بررسی وضعیت فعلی
SELECT name, probability FROM prizes;

-- 2. ذخیره وضعیت فعلی
CREATE TABLE prizes_backup AS SELECT * FROM prizes;

-- 3. اعمال استراتژی جدید
UPDATE prizes SET probability = CASE 
    WHEN id = 1 THEN 0.01  -- iPhone (1%)
    WHEN id = 2 THEN 0.02  -- لپ‌تاپ (2%)
    WHEN id = 3 THEN 0.12  -- کارت 500K (12%)
    WHEN id = 4 THEN 0.20  -- طلایی (20%)
    WHEN id = 5 THEN 0.30  -- کارت 100K (30%)
    WHEN id = 6 THEN 0.15  -- پوچ (15%)
    WHEN id = 7 THEN 0.15  -- تخفیف (15%)
    WHEN id = 8 THEN 0.05  -- هدفون (5%)
END WHERE is_active = TRUE;

-- 4. بررسی مجموع
SELECT SUM(probability) as total FROM prizes WHERE is_active = TRUE;
-- نتیجه باید 1.00 باشد

-- 5. تایید نهایی
SELECT 
    name,
    CONCAT(ROUND(probability * 100, 1), '%') as 'شانس برد'
FROM prizes 
ORDER BY probability DESC;
```

---

## 📞 پشتیبانی

در صورت بروز مشکل:
1. مجموع احتمالات را چک کنید
2. از نرمال‌سازی خودکار استفاده کنید
3. لاگ‌های سرور را بررسی کنید
4. جدول prizes_log را برای آمار بررسی کنید

---

*آخرین به‌روزرسانی: ژانویه 2025*