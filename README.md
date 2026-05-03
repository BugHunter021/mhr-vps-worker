# mhr-vps-worker 🚀

[**English**](#english) | [**فارسی**](#persian)

---

<a name="persian"></a>
##  راهنمای فارسی

این پروژه نسخه‌ی بهبودیافته و تطبیق‌یافته‌ی موتور **mhr-cfw** است که به جای استفاده از Cloudflare Workers، از یک سرور شخصی (VPS) به عنوان ورکر استفاده می‌کند.

### 🌟 مزایا نسبت به نسخه‌ی کلادفلر
* **آی‌پی ثابت:** جلوگیری از مسدود شدن توسط سرویس‌هایی که به آی‌پی حساس هستند.
* **باز شدن سایت های حساس به IP:** باز شدن بدون مشکل Gemini، ChatGPT و سایر ابزارهای AI.
* **بدون محدودیت روزانه:** عبور از محدودیت‌های رایگانِ روزانه‌ی کلادفلر ورکر.

### 🛠 پیش‌نیازها
1. **نصب بودن پروژه اصلی:** این پروژه جایگزین بخش ورکر است. اگر هنوز کلاینت را ندارید، ابتدا [mhr-cfw](https://github.com/denuitt1/mhr-cfw) را نصب کنید.
2. **سرور لینوکس (VPS):** حتی ضعیف‌ترین سرور (Minimum Specs) با سیستم‌عامل Ubuntu/Debian کافی است.

---

### 🚀 مراحل نصب و راه‌اندازی

#### ۱. آماده‌سازی سرور (VPS)
ابتدا از طریق SSH به سرور خود متصل شوید و دستورات زیر را برای نصب Node.js و PM2 اجرا کنید:

```bash
# نصب Node.js
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
sudo apt-get install -y nodejs

# نصب PM2 برای مدیریت فرآیندها
sudo npm install pm2 -g
```

پورت **8081** را در فایروال لینوکس (UFW) باز کنید:
```bash
sudo ufw allow 8081/tcp
sudo ufw reload
```

فایل `server.js` را در سرور قرار داده و اجرا کنید:
```bash
pm2 start server.js --name mhr-relay --node-args="--max-http-header-size=65536"
pm2 save
```

**✅ بررسی صحت اجرا:** پس از اجرای دستور بالا، باید یک جدول سبز رنگ ببینید که وضعیت `mhr-relay` را **online** نشان می‌دهد. برای اطمینان بیشتر، دستور `pm2 logs mhr-relay` را بزنید؛ باید پیام `Rock-Solid Worker running on port 8081` را مشاهده کنید.

#### ۲. بروزرسانی Google Apps Script
در پنل Google Apps Script، فایل `Code.gs` را باز کرده و آدرس ورکر را به آی‌پی سرور خود تغییر دهید:

```javascript
// آی‌پی سرور خود را جایگزین کنید
const VPS_IP = "YOUR_SERVER_IP"; 
```
سپس پروژه را مجدداً **Deploy** کنید و آیدی (Deployment ID) جدید را بردارید.

#### ۳. تنظیمات کلاینت (Local)
به پوشه‌ی اصلی کلاینت (`mhr-cfw`) در سیستم خود بروید و فایل `config.json` را با یک ویرایشگر متنی باز کنید. تغییرات زیر را اعمال کنید:

* **تایم‌اوت:** مقدار `relay_timeout` را حتماً به **60** تغییر دهید.
* **آیدی اسکریپت:** در بخش `script_id` آیدی جدید را قرار دهید. (می‌توانید برای لودبالانسینگ و جلوگیری از محدودیت، چند آیدی را با کاما `,` جدا کنید).

```json
{
  "relay_timeout": 60,
  "script_id": "ID1,ID2"
```

---

<a name="english"></a>
## 🇺🇸 English Guide

**mhr-vps-worker** is a specialized adaptation of the **mhr-cfw** engine that replaces Cloudflare Workers with a private VPS-based Node.js worker.

### 🌟 Key Advantages
* **Static IP:** Maintain a consistent IP address for all proxied requests.
* **AI Ready:** Seamlessly access Gemini, ChatGPT, and other AI platforms without chunking drops.
* **No Daily Limits:** Bypass Cloudflare's free tier request limits.
* **Private Infrastructure:** Runs exclusively on your own VPS.

### 🛠 Prerequisites
1. **Core Project:** This is a worker replacement. Ensure you have the [mhr-cfw](https://github.com/denuitt1/mhr-cfw) client installed first.
2. **Linux VPS:** A basic VPS (minimum specs) running Ubuntu/Debian.

---

### 🚀 Setup Instructions

#### 1. VPS Configuration
Connect to your VPS via SSH and install Node.js and PM2:

```bash
# Install Node.js
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install pm2 -g
```

Open port **8081** in your Linux firewall (UFW):
```bash
sudo ufw allow 8081/tcp
sudo ufw reload
```

Deploy the `server.js` file and run it:
```bash
pm2 start server.js --name mhr-relay --node-args="--max-http-header-size=65536"
pm2 save
```

**✅ Verification:** You should see a green table indicating `mhr-relay` is **online**. To double-check, run `pm2 logs mhr-relay`. You should see the message: `Rock-Solid Worker running on port 8081`.

#### 2. Update Google Apps Script
Open your `Code.gs` in the Google Apps Script editor and point it to your VPS:

```javascript
const VPS_IP = "YOUR_SERVER_IP"; 
const WORKER_URL = "http://" + VPS_IP + ":8081";
```
Re-**Deploy** the script and copy the new Deployment ID.

#### 3. Client Configuration (Local)
Navigate to your main `mhr-cfw` folder on your local machine and open the `config.json` file. Make the following adjustments:

* **Timeout:** Set `relay_timeout` to **60**.
* **Script IDs:** Update the `script_id`. You can use multiple IDs separated by commas for load balancing.

```json
{
  "relay_timeout": 60,
  "script_id": "YOUR_DEPLOYMENT_ID_1,YOUR_DEPLOYMENT_ID_2",
  "direct_google_exclude": [
    "gemini.google.com",
    "chatgpt.com"
  ]
}
```

---
**Disclaimer:** This tool is for educational purposes only. Use it responsibly.
