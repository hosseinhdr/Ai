# مدیریت کننده کانال‌های تلگرام نسخه 2.0

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen.svg)

**سیستم حرفه‌ای مدیریت کانال‌های تلگرام با API RESTful**

[ویژگی‌ها](#-ویژگی‌ها) • [شروع سریع](#-شروع-سریع) • [مستندات API](#-مستندات-api) • [استقرار](#-استقرار) • [پشتیبانی](#-پشتیبانی)

</div>

## 📋 فهرست مطالب

- [معرفی](#-معرفی)
- [ویژگی‌ها](#-ویژگی‌ها)
- [نیازمندی‌های سیستم](#-نیازمندی‌های-سیستم)
- [شروع سریع](#-شروع-سریع)
- [نصب](#-نصب)
- [پیکربندی](#-پیکربندی)
- [مستندات API](#-مستندات-api)
- [پنل مدیریت](#-پنل-مدیریت)
- [استقرار با Docker](#-استقرار-با-docker)
- [ساختار دیتابیس](#-ساختار-دیتابیس)
- [محدودیت نرخ درخواست](#-محدودیت-نرخ-درخواست)
- [مانیتورینگ](#-مانیتورینگ)
- [امنیت](#-امنیت)
- [عیب‌یابی](#-عیب‌یابی)

## 🎯 معرفی

مدیریت کننده کانال‌های تلگرام یک راه‌حل جامع برای مدیریت چندین کانال تلگرام به صورت برنامه‌نویسی است. این سیستم API RESTful قدرتمند، مانیتورینگ بلادرنگ و پنل مدیریت شهودی برای عملیات موثر کانال‌ها فراهم می‌کند.

### مزایای کلیدی
- **پشتیبانی چند سشن**: مدیریت همزمان چندین اکانت تلگرام
- **توزیع بار هوشمند**: انتخاب خودکار سشن بر اساس ظرفیت
- **امنیت سازمانی**: احراز هویت کلید API با مجوزهای دقیق
- **مانیتورینگ لحظه‌ای**: متریک‌ها و مانیتورینگ سلامت زنده
- **محدودیت نرخ**: حفاظت داخلی در برابر محدودیت‌های API تلگرام
- **یکپارچگی دیتابیس**: ردیابی کامل و آمار
- **پنل مدیریت**: رابط مدیریت تحت وب

## ✨ ویژگی‌ها

### 🚀 عملیات کانال
- **عضویت در کانال**: عضویت خودکار با انتخاب بهترین سشن
- **خروج از کانال**: خروج ایمن از کانال‌ها
- **اطلاعات کانال**: دریافت اطلاعات کامل کانال‌ها
- **فهرست کانال‌ها**: مشاهده تمام کانال‌های عضو
- **پاکسازی**: خروج خودکار از کانال‌های غیرفعال

### 🔐 امنیت و احراز هویت
- **کلیدهای API**: سیستم کلید API با مجوزهای قابل تنظیم
- **کلید مدیر**: دسترسی کامل با کلید مدیر
- **سطوح دسترسی**: کنترل دقیق دسترسی به endpoint ها
- **ثبت درخواست‌ها**: لاگ کامل تمام فعالیت‌ها

### 📊 مانیتورینگ و آمار
- **متریک‌های لحظه‌ای**: مانیتورینگ زنده سیستم
- **آمار استفاده**: آمار تفصیلی کلیدهای API
- **سلامت سیستم**: بررسی وضعیت سشن‌ها و سرویس‌ها
- **هشدارها**: اعلان خودکار مشکلات

### 🛡️ محدودیت نرخ و حفاظت
- **محدودیت چندسطحی**: محدودیت دقیقه‌ای و ساعتی
- **حفاظت IP**: محدودیت بر اساس IP
- **کاهش سرعت**: کاهش تدریجی سرعت به جای بلاک کردن
- **پشتیبانی Redis**: ذخیره‌سازی توزیع شده

## 💻 نیازمندی‌های سیستم

### نیازمندی‌های اجباری
- **Node.js**: نسخه 18.0.0 یا بالاتر
- **MySQL**: نسخه 8.0 یا بالاتر
- **API تلگرام**: API ID و API Hash

### نیازمندی‌های اختیاری
- **Redis**: برای rate limiting توزیع شده
- **Docker**: برای استقرار containerized
- **Nginx**: برای proxy معکوس

### سخت‌افزار پیشنهادی
- **CPU**: حداقل 2 هسته
- **RAM**: حداقل 2GB
- **دیسک**: حداقل 10GB فضای خالی
- **شبکه**: اتصال پایدار اینترنت

## 🚀 شروع سریع

### 1. دریافت API تلگرام
```bash
# به my.telegram.org بروید
# API ID و API Hash خود را دریافت کنید
```

### 2. کلون کردن پروژه
```bash
git clone https://github.com/yourusername/telegram-channel-manager.git
cd telegram-channel-manager
```

### 3. نصب وابستگی‌ها
```bash
npm install
```

### 4. پیکربندی محیط
```bash
cp .env.example .env
# فایل .env را ویرایش کنید
```

### 5. راه‌اندازی دیتابیس
```bash
# MySQL ایجاد کنید
mysql -u root -p
CREATE DATABASE telegram_manager;
```

### 6. اجرای اپلیکیشن
```bash
npm start
```

### 7. دسترسی به پنل
```bash
# پنل مدیریت: http://localhost:3000/admin
# مستندات API: http://localhost:3000/api/docs
```

## 📦 نصب


### نصب خودکار
```bash
# اسکریپت نصب خودکار
curl -fsSL https://raw.githubusercontent.com/yourusername/telegram-channel-manager/main/install.sh | bash
```

## ⚙️ پیکربندی

### فایل .env
```env
# == اطلاعات تلگرام ==
API_ID=your_api_id
API_HASH=your_api_hash

# == سشن‌های تلگرام ==
SESSION_1=your_session_string_1|true
SESSION_2=your_session_string_2|false
# فرمت: session_string|is_premium

# == تنظیمات سرور ==
API_HOST=0.0.0.0
API_PORT=3000
NODE_ENV=production
CORS_ORIGIN=*

# == دیتابیس MySQL ==
DB_HOST=localhost
DB_PORT=3306
DB_USER=telegram_user
DB_PASSWORD=your_secure_password
DB_NAME=telegram_manager

# == Redis (اختیاری) ==
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# == امنیت ==
ENCRYPTION_KEY=your-32-character-encryption-key
MASTER_API_KEY=your_master_api_key

# == لاگ ==
LOG_LEVEL=info

# == مانیتورینگ ==
INACTIVITY_DAYS=7
```

### ایجاد سشن تلگرام
```bash
# اجرای اسکریپت ایجاد سشن
npm run create-session

# دستورالعمل‌ها:
# 1. شماره تلفن خود را وارد کنید
# 2. کد تایید را وارد کنید
# 3. session string کپی کنید
# 4. به .env اضافه کنید
```

### تنظیمات پیشرفته

#### Rate Limiting
```javascript
// در src/middleware/rateLimiter.js
export const customLimiter = createRateLimiter({
    windowMs: 60 * 1000,     // پنجره زمانی (میلی‌ثانیه)
    max: 30,                 // حداکثر درخواست
    prefix: 'rl:custom:'     // پیشوند Redis
});
```

#### مانیتورینگ
```javascript
// در src/services/monitoring.js
const config = {
    updateInterval: 30000,    // بروزرسانی هر 30 ثانیه
    historyInterval: 300000,  // ذخیره تاریخچه هر 5 دقیقه
    cleanupInterval: 3600000  // پاکسازی هر ساعت
};
```

## 📖 مستندات API

### احراز هویت
تمام endpoint های `/api/*` نیاز به کلید API دارند:

```bash
# در header
curl -H "x-api-key: your_api_key" http://localhost:3000/api/endpoint

# یا در query parameter
curl "http://localhost:3000/api/endpoint?api_key=your_api_key"
```

### Endpoint های اصلی

#### 🔑 مدیریت کلیدهای API

##### ایجاد کلید API جدید
```http
POST /api/keys/generate
Content-Type: application/json
x-api-key: master_key

{
  "name": "My API Key",
  "description": "برای اپلیکیشن من",
  "permissions": ["GET /api/channel/info", "POST /api/channel/join"],
  "rateLimitPerMinute": 30,
  "rateLimitPerHour": 1000,
  "expiresInDays": 30
}
```

**پاسخ:**
```json
{
  "success": true,
  "message": "API key created successfully",
  "apiKey": "abc123...",
  "details": {
    "id": 1,
    "name": "My API Key",
    "permissions": ["GET /api/channel/info", "POST /api/channel/join"]
  }
}
```

##### فهرست کلیدها
```http
GET /api/keys/list
x-api-key: master_key
```

##### حذف کلید
```http
DELETE /api/keys/123
x-api-key: master_key
```

#### 📱 عملیات کانال

##### عضویت در کانال
```http
POST /api/channel/join
Content-Type: application/json
x-api-key: your_api_key

{
  "channel": "@channelname"
  // یا "channel": "https://t.me/channelname"
  // یا "channel": "https://t.me/joinchat/ABCD..."
}
```

**پاسخ:**
```json
{
  "success": true,
  "sessionUsed": "session_1",
  "channelId": "-1001234567890",
  "channelTitle": "کانال تست",
  "channelUsername": "testchannel",
  "sessionCapacity": "250/1000",
  "remainingSlots": 750,
  "rateLimit": {
    "remaining": 4,
    "resetTime": "2024-01-01T12:05:00.000Z"
  }
}
```

##### خروج از کانال
```http
POST /api/channel/leave
Content-Type: application/json
x-api-key: your_api_key

{
  "channelId": "-1001234567890",
  "sessionName": "session_1"  // اختیاری
}
```

##### اطلاعات کانال
```http
GET /api/channel/info?channel=@channelname
x-api-key: your_api_key
```

**پاسخ:**
```json
{
  "success": true,
  "data": {
    "id": "-1001234567890",
    "title": "کانال تست",
    "username": "testchannel",
    "about": "توضیحات کانال",
    "participantsCount": 1250,
    "isPublic": true,
    "sessionName": "session_1"
  }
}
```

##### فهرست کانال‌ها
```http
GET /api/channel/list
x-api-key: your_api_key
```

**پاسخ:**
```json
{
  "success": true,
  "data": {
    "total": 125,
    "bySession": {
      "session_1": {
        "connected": true,
        "isPremium": true,
        "channelsCount": 75,
        "maxCapacity": 1000,
        "remainingCapacity": 925,
        "usage": "7.5%",
        "channels": [...]
      }
    },
    "allChannels": [...]
  }
}
```

##### پاکسازی کانال‌های غیرفعال
```http
POST /api/channel/cleanup
Content-Type: application/json
x-api-key: your_api_key

{
  "days": 7  // کانال‌های بدون فعالیت بیش از 7 روز
}
```

#### 📊 مانیتورینگ و آمار

##### وضعیت سیستم
```http
GET /api/monitoring/status
x-api-key: your_api_key
```

##### آمار لحظه‌ای
```http
GET /api/monitoring/realtime
x-api-key: your_api_key
```

##### تاریخچه
```http
GET /api/monitoring/history/capacity?hours=24
x-api-key: your_api_key
```

##### هشدارها
```http
GET /api/monitoring/alerts
x-api-key: your_api_key
```

#### 🔧 مدیریت سشن‌ها

##### وضعیت سشن‌ها
```http
GET /api/session/status
x-api-key: your_api_key
```

##### ظرفیت سیستم
```http
GET /api/session/capacity
x-api-key: your_api_key
```

### کدهای خطا

| کد | توضیح |
|-----|--------|
| 400 | درخواست نامعتبر |
| 401 | کلید API نامعتبر |
| 403 | عدم دسترسی |
| 429 | تجاوز از حد مجاز درخواست |
| 500 | خطای سرور |

### نمونه‌های کد

#### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'x-api-key': 'your_api_key'
  }
});

// عضویت در کانال
async function joinChannel(channel) {
  try {
    const response = await api.post('/channel/join', { channel });
    console.log('عضویت موفق:', response.data);
  } catch (error) {
    console.error('خطا:', error.response.data);
  }
}

// دریافت آمار
async function getStats() {
  const response = await api.get('/session/status');
  return response.data;
}
```

#### Python
```python
import requests

class TelegramManager:
    def __init__(self, api_key, base_url='http://localhost:3000/api'):
        self.session = requests.Session()
        self.session.headers.update({'x-api-key': api_key})
        self.base_url = base_url
    
    def join_channel(self, channel):
        response = self.session.post(
            f'{self.base_url}/channel/join',
            json={'channel': channel}
        )
        return response.json()
    
    def get_status(self):
        response = self.session.get(f'{self.base_url}/session/status')
        return response.json()

# استفاده
tm = TelegramManager('your_api_key')
result = tm.join_channel('@testchannel')
print(result)
```

#### PHP
```php
<?php

class TelegramManager {
    private $apiKey;
    private $baseUrl;
    
    public function __construct($apiKey, $baseUrl = 'http://localhost:3000/api') {
        $this->apiKey = $apiKey;
        $this->baseUrl = $baseUrl;
    }
    
    private function makeRequest($method, $endpoint, $data = null) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->baseUrl . $endpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'x-api-key: ' . $this->apiKey,
            'Content-Type: application/json'
        ]);
        
        if ($method === 'POST' && $data) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
        
        $response = curl_exec($ch);
        curl_close($ch);
        
        return json_decode($response, true);
    }
    
    public function joinChannel($channel) {
        return $this->makeRequest('POST', '/channel/join', ['channel' => $channel]);
    }
    
    public function getStatus() {
        return $this->makeRequest('GET', '/session/status');
    }
}

// استفاده
$tm = new TelegramManager('your_api_key');
$result = $tm->joinChannel('@testchannel');
print_r($result);
?>
```

## 🎨 پنل مدیریت

پنل مدیریت تحت وب در آدرس `http://localhost:3000/admin` در دسترس است.

### ویژگی‌های پنل

#### 📊 داشبورد اصلی
- **آمار کلی**: تعداد سشن‌ها، کانال‌ها، درخواست‌ها
- **نمودار ظرفیت**: نمایش ظرفیت هر سشن
- **فعالیت‌های اخیر**: آخرین عضویت‌ها و خروج‌ها
- **هشدارهای سیستم**: اعلان مشکلات

#### 🔑 مدیریت کلیدهای API
- **ایجاد کلید جدید**: با تنظیم مجوزها و محدودیت‌ها
- **مشاهده کلیدها**: فهرست تمام کلیدهای فعال
- **ویرایش مجوزها**: تغییر دسترسی‌های کلیدها
- **آمار استفاده**: میزان استفاده هر کلید

#### 📱 مدیریت سشن‌ها
- **وضعیت سشن‌ها**: آنلاین/آفلاین، ظرفیت
- **مدیریت کانال‌ها**: فهرست کانال‌های هر سشن
- **اتصال مجدد**: راه‌اندازی مجدد سشن‌های قطع شده

#### 📈 مانیتورینگ
- **نمودارهای زنده**: ظرفیت، درخواست‌ها، خطاها
- **گزارش سلامت**: وضعیت کلی سیستم
- **لاگ‌ها**: مشاهده فعالیت‌های سیستم

### راه‌اندازی پنل

#### 1. فایل‌های static
```bash
# ایجاد پوشه public
mkdir public

# کپی فایل‌های پنل
cp -r admin-panel/* public/
```

#### 2. تنظیمات Nginx (اختیاری)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /admin {
        auth_basic "Admin Panel";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://localhost:3000/admin;
    }
}
```

## 💾 ساختار دیتابیس

### جداول اصلی

#### api_keys - کلیدهای API
```sql
CREATE TABLE api_keys (
    id INT PRIMARY KEY AUTO_INCREMENT,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_master BOOLEAN DEFAULT FALSE,
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_hour INT DEFAULT 1000,
    total_requests INT DEFAULT 0,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    created_ip VARCHAR(45),
    expires_at TIMESTAMP NULL
);
```

#### telegram_sessions - سشن‌های تلگرام
```sql
CREATE TABLE telegram_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) UNIQUE NOT NULL,
    session_string TEXT NOT NULL,
    phone_number VARCHAR(20),
    is_premium BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_connected BOOLEAN DEFAULT FALSE,
    current_channels_count INT DEFAULT 0,
    max_channels INT DEFAULT 500,
    health_status ENUM('healthy', 'warning', 'critical', 'dead') DEFAULT 'healthy',
    last_connected_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### channels - اطلاعات کانال‌ها
```sql
CREATE TABLE channels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    channel_id VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(100),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    participants_count INT DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### session_channels - رابطه سشن و کانال
```sql
CREATE TABLE session_channels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    session_id INT NOT NULL,
    channel_id INT NOT NULL,
    is_member BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    joined_by_api_key INT,
    FOREIGN KEY (session_id) REFERENCES telegram_sessions(id),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (joined_by_api_key) REFERENCES api_keys(id),
    UNIQUE KEY unique_session_channel (session_id, channel_id)
);
```

#### request_logs - لاگ درخواست‌ها
```sql
CREATE TABLE request_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    api_key_id INT,
    method VARCHAR(10) NOT NULL,
    endpoint VARCHAR(200) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_body JSON,
    query_params JSON,
    status_code INT NOT NULL,
    response_time_ms INT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
```

### ایندکس‌ها و بهینه‌سازی

```sql
-- ایندکس‌های عملکردی
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_sessions_active ON telegram_sessions(is_active, is_connected);
CREATE INDEX idx_channels_id ON channels(channel_id);
CREATE INDEX idx_session_channels_session ON session_channels(session_id, is_member);
CREATE INDEX idx_request_logs_api_key_time ON request_logs(api_key_id, created_at);
CREATE INDEX idx_request_logs_endpoint_time ON request_logs(endpoint, created_at);

-- ایندکس composite برای جستجوهای پیچیده
CREATE INDEX idx_session_channels_lookup ON session_channels(session_id, channel_id, is_member);
CREATE INDEX idx_logs_stats ON request_logs(created_at, status_code, response_time_ms);
```

### Stored Procedures

#### پاکسازی لاگ‌های قدیمی
```sql
DELIMITER //
CREATE PROCEDURE sp_cleanup_old_logs(IN days_to_keep INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    
    DELETE FROM request_logs 
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);
    
    DELETE FROM rate_limits 
    WHERE window_start < DATE_SUB(NOW(), INTERVAL 1 DAY);
    
    COMMIT;
END //
DELIMITER ;
```

#### آمار استفاده API
```sql
DELIMITER //
CREATE PROCEDURE sp_api_usage_stats(IN api_key_id INT, IN days INT)
BEGIN
    SELECT 
        DATE(created_at) as date,
        COUNT(*) as requests,
        AVG(response_time_ms) as avg_response_time,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
        COUNT(DISTINCT endpoint) as unique_endpoints
    FROM request_logs 
    WHERE api_key_id = api_key_id 
        AND created_at > DATE_SUB(NOW(), INTERVAL days DAY)
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
END //
DELIMITER ;
```

## ⚡ محدودیت نرخ درخواست

سیستم محدودیت نرخ چندلایه برای حفاظت در برابر سوء استفاده و رعایت محدودیت‌های تلگرام.

### انواع محدودیت‌ها

#### 1. محدودیت سراسری
```javascript
// 100 درخواست در دقیقه برای تمام کاربران
globalLimiter: {
    windowMs: 60 * 1000,
    max: 100
}
```

#### 2. محدودیت بر اساس IP
```javascript
// 200 درخواست در 15 دقیقه برای هر IP
strictIpLimiter: {
    windowMs: 15 * 60 * 1000,
    max: 200
}
```

#### 3. محدودیت‌های اختصاصی endpoint

| Endpoint | حد مجاز/دقیقه | دلیل |
|----------|---------------|------|
| `/api/channel/join` | 5 | محدودیت سخت تلگرام |
| `/api/channel/leave` | 10 | عملیات متوسط |
| `/api/channel/info` | 30 | عملیات سبک |
| `/api/channel/list` | 10 | عملیات سنگین |
| `/api/channel/cleanup` | 2/ساعت | عملیات بسیار سنگین |

#### 4. کاهش تدریجی سرعت
```javascript
// به جای بلاک کردن، سرعت کم می‌شود
joinChannelSpeedLimiter: {
    delayAfter: 2,        // بعد از 2 درخواست
    delayMs: 2000,        // 2 ثانیه تاخیر
    maxDelayMs: 30000     // حداکثر 30 ثانیه
}
```

### پیکربندی Redis

#### راه‌اندازی Redis
```bash
# نصب Redis
sudo apt install redis-server

# راه‌اندازی
sudo systemctl start redis
sudo systemctl enable redis

# تست
redis-cli ping
# باید PONG برگردد
```

#### تنظیمات Redis در .env
```env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### مدیریت خطاهای Rate Limit

#### پاسخ استاندارد
```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "retryAfter": 60,
  "limit": 5,
  "remaining": 0,
  "resetTime": "2024-01-01T12:05:00.000Z",
  "suggestion": "Maximum 5 channels per minute to avoid Telegram restrictions"
}
```

#### نحوه مدیریت در کد
```javascript
// کلاینت JavaScript
async function handleRateLimit(error) {
  if (error.response?.status === 429) {
    const retryAfter = error.response.data.retryAfter;
    console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    
    // صبر و تلاش مجدد
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return await retryRequest();
  }
  throw error;
}
```

## 📊 مانیتورینگ

سیستم مانیتورینگ جامع برای نظارت بر سلامت و عملکرد سیستم.

### متریک‌های کلیدی

#### 1. سلامت سشن‌ها
- **وضعیت اتصال**: آنلاین/آفلاین
- **ظرفیت**: تعداد کانال‌های استفاده شده/کل
- **نوع اکانت**: معمولی/پریمیوم
- **آخرین اتصال**: زمان آخرین فعالیت

#### 2. عملکرد سیستم
- **زمان پاسخ**: میانگین زمان پاسخ API
- **نرخ خطا**: درصد درخواست‌های ناموفق
- **تعداد درخواست**: درخواست در دقیقه/ساعت
- **Uptime**: مدت زمان فعالیت سیستم

#### 3. آمار کانال‌ها
- **تعداد کل**: مجموع کانال‌های عضو شده
- **فعالیت‌های اخیر**: عضویت‌ها و خروج‌های جدید
- **توزیع بین سشن‌ها**: نحوه پخش کانال‌ها

### Dashboard

#### مشاهده وضعیت لحظه‌ای
```http
GET /api/monitoring/realtime
```

**پاسخ:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2024-01-01T12:00:00.000Z",
    "sessions": {
      "connected": 3,
      "total": 4,
      "health": "good"
    },
    "capacity": {
      "percentage": 45,
      "used": 450,
      "total": 1000,
      "remaining": 550
    },
    "performance": {
      "uptime": 86400,
      "requestsPerMinute": 25,
      "errorsPerMinute": 0,
      "avgResponseTime": 150
    },
    "healthScore": 95
  }
}
```

#### تاریخچه و نمودارها
```http
GET /api/monitoring/history/capacity?hours=24
```

### هشدارها

#### انواع هشدارها
- **خطر (Critical)**: سشن‌های قطع شده، ظرفیت بالای 90%
- **هشدار (Warning)**: ظرفیت بالای 80%, نرخ خطای بالا
- **اطلاع (Info)**: فعالیت‌های عادی

#### مثال هشدار
```json
{
  "id": 12345,
  "type": "critical",
  "title": "High Capacity Usage",
  "message": "System capacity at 92%. Consider cleanup or adding sessions.",
  "time": "2024-01-01T12:00:00.000Z",
  "action": "Run cleanup or add more sessions"
}
```

### لاگ‌گیری

#### سطوح لاگ
- **Error**: خطاهای مهم
- **Warn**: هشدارها
- **Info**: اطلاعات عمومی
- **Debug**: اطلاعات تفصیلی

#### فایل‌های لاگ
```
logs/
├── error.log          # فقط خطاها
├── combined.log       # همه لاگ‌ها
└── access.log         # درخواست‌های HTTP
```

#### تنظیم سطح لاگ
```env
LOG_LEVEL=info  # error, warn, info, debug
```

## 🔒 امنیت

### احراز هویت

#### کلیدهای API
- **هش SHA-256**: کلیدها به صورت hash ذخیره می‌شوند
- **انقضا**: امکان تنظیم تاریخ انقضا
- **مجوزهای دقیق**: کنترل دسترسی به endpoint های خاص

#### کلید مدیر (Master Key)
```env
MASTER_API_KEY=your_very_secure_master_key_here
```

### رمزنگاری

#### رمزنگاری سشن‌ها
Session stringها با AES-256-CBC رمزنگاری می‌شوند:

```env
ENCRYPTION_KEY=your-32-character-encryption-key!!
```

#### مثال کد رمزنگاری
```javascript
// رمزنگاری
const encrypted = database.encryptData(sessionString);

// رمزگشایی
const decrypted = database.decryptData(encrypted);
```

### حفاظت در برابر حملات

#### SQL Injection
- استفاده از prepared statements
- validation ورودی‌ها
- escape کردن داده‌ها

#### XSS Protection
```javascript
// تنظیم header های امنیتی
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

#### DDoS Protection
- Rate limiting چندلایه
- محدودیت بر اساس IP
- کاهش تدریجی سرعت

### بهترین روش‌های امنیتی

#### 1. تنظیمات production
```env
NODE_ENV=production
```

#### 2. پروکسی معکوس
```nginx
# محدودیت اندازه درخواست
client_max_body_size 10M;

# مخفی کردن ورژن سرور
server_tokens off;

# SSL/TLS
ssl_protocols TLSv1.2 TLSv1.3;
```

#### 3. فایروال
```bash
# فقط پورت‌های ضروری
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

#### 4. مانیتورینگ امنیتی
- لاگ تمام درخواست‌ها
- هشدار برای فعالیت‌های مشکوک
- بکاپ منظم دیتابیس

## 🛠️ عیب‌یابی

### مشکلات رایج

#### 1. خطای اتصال دیتابیس
```
❌ MySQL connection failed: ECONNREFUSED
```

**راه‌حل:**
```bash
# بررسی وضعیت MySQL
sudo systemctl status mysql

# راه‌اندازی MySQL
sudo systemctl start mysql

# بررسی تنظیمات .env
DB_HOST=localhost
DB_PORT=3306
DB_USER=telegram_user
DB_PASSWORD=your_password
```

#### 2. خطای سشن تلگرام
```
❌ Failed to connect session: AUTH_KEY_INVALID
```

**راه‌حل:**
```bash
# سشن جدید ایجاد کنید
npm run create-session

# session string را در .env بروزرسانی کنید
SESSION_1=new_session_string|true
```

#### 3. خطای Rate Limit
```
❌ Rate limit exceeded: Too many requests
```

**راه‌حل:**
- کاهش تعداد درخواست‌ها
- استفاده از delay بین درخواست‌ها
- بررسی تنظیمات rate limiting

#### 4. خطای ظرفیت تلگرام
```
❌ CHANNELS_TOO_MUCH: Maximum channels limit reached
```

**راه‌حل:**
```bash
# پاکسازی کانال‌های غیرفعال
curl -X POST http://localhost:3000/api/channel/cleanup \
  -H "x-api-key: your_key" \
  -d '{"days": 7}'

# یا اضافه کردن سشن جدید
```

### ابزارهای عیب‌یابی

#### 1. لاگ‌های سیستم
```bash
# مشاهده لاگ‌های زنده
tail -f logs/combined.log

# جستجو در لاگ‌ها
grep "ERROR" logs/error.log

# لاگ‌های دیتابیس
sudo tail -f /var/log/mysql/error.log
```

#### 2. بررسی وضعیت سرویس‌ها
```bash
# وضعیت Node.js
ps aux | grep node

# وضعیت MySQL
sudo systemctl status mysql

# وضعیت Redis
redis-cli ping
```

#### 3. ابزارهای شبکه
```bash
# بررسی پورت‌ها
netstat -tulpn | grep :3000

# تست اتصال
curl http://localhost:3000/health

# بررسی DNS
nslookup api.telegram.org
```

#### 4. مانیتورینگ منابع
```bash
# استفاده CPU و RAM
htop

# فضای دیسک
df -h

# اتصالات دیتابیس
mysql> SHOW PROCESSLIST;
```

### حل مشکلات خاص

#### مشکل اتصال به تلگرام
```bash
# بررسی proxy
export HTTP_PROXY=http://your-proxy:port
export HTTPS_PROXY=http://your-proxy:port

# تست اتصال
curl https://api.telegram.org
```

#### مشکل عملکرد پایین
```sql
-- بررسی کوئری‌های کند
SELECT * FROM information_schema.processlist 
WHERE time > 5;

-- بهینه‌سازی جداول
OPTIMIZE TABLE request_logs;
ANALYZE TABLE session_channels;
```

#### مشکل حافظه
```bash
# بررسی استفاده حافظه Node.js
node --max-old-space-size=4096 src/app.js

# تنظیم حداکثر حافظه
export NODE_OPTIONS="--max-old-space-size=4096"
```

### فایل‌های لاگ مفید

#### application logs
```
logs/combined.log    # همه فعالیت‌ها
logs/error.log       # فقط خطاها
```

#### system logs
```
/var/log/syslog      # لاگ سیستم
/var/log/mysql/      # لاگ MySQL
/var/log/nginx/      # لاگ Nginx
```

## 📈 بهینه‌سازی عملکرد

### تنظیمات Node.js

#### حافظه و CPU
```bash
# اجرا با حافظه بیشتر
node --max-old-space-size=4096 src/app.js

# استفاده از PM2
npm install -g pm2
pm2 start src/app.js --name telegram-manager -i max
```

#### فایل ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'telegram-manager',
    script: 'src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      MAX_OLD_SPACE_SIZE: 4096
    },
    log_file: 'logs/pm2.log',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log'
  }]
};
```

### بهینه‌سازی دیتابیس

#### تنظیمات MySQL
```sql
-- در /etc/mysql/my.cnf
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
max_connections = 200
query_cache_size = 128M
tmp_table_size = 128M
max_heap_table_size = 128M
```

#### ایندکس‌های بهینه
```sql
-- بررسی کوئری‌های کند
SHOW FULL PROCESSLIST;

-- تحلیل کوئری
EXPLAIN SELECT * FROM request_logs WHERE api_key_id = 1;

-- ایندکس جدید
CREATE INDEX idx_logs_performance ON request_logs(api_key_id, created_at, status_code);
```

### کش کردن

#### Redis Caching
```javascript
// کش کردن نتایج پرطرفدار
const cacheKey = `channel_info:${channelId}`;
const cached = await redis.get(cacheKey);

if (cached) {
    return JSON.parse(cached);
}

const result = await getChannelInfo(channelId);
await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 دقیقه
return result;
```

#### Application-level Caching
```javascript
// کش در حافظه برای داده‌های ثابت
const cache = new Map();

function getCachedData(key, fetcher, ttl = 300000) {
    const now = Date.now();
    const item = cache.get(key);
    
    if (item && (now - item.timestamp) < ttl) {
        return item.data;
    }
    
    const data = fetcher();
    cache.set(key, { data, timestamp: now });
    return data;
}
```