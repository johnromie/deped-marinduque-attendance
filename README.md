# DepEd Marinduque Attendance Monitoring App

This app captures employee attendance with:
- account login (username + password)
- selfie/photo proof
- high-accuracy GPS coordinates
- server-side distance check against DepEd office coordinates
- status result: `ON_SITE`, `OFF_SITE`, or `NEEDS_REVIEW`
- photo + logs saved in the main server

## 1) Install and run

```bash
npm install
copy .env.example .env
npm start
```

Server starts at `http://localhost:4000`.

## 2) Authentication (no API key needed)

Users must create an account first using:
- employee ID
- full name
- username + password
- security question + answer (for forgot password)

Available auth features:
- Login with username + password
- Register account directly
- Forgot Password (using security answer)
- Change Password (while logged in)

## 3) Configure office location and auth secret

Edit `.env`:
- `OFFICE_LAT` and `OFFICE_LNG`: exact DepEd Marinduque office coordinates
- `MAX_RADIUS_METERS`: allowed distance from office (example: 150 to 250)
- `MAX_GPS_ACCURACY_METERS`: required GPS quality (example: 30 to 50)
- `AUTH_SECRET`: strong secret used for login tokens
- `TOKEN_TTL_HOURS`: token validity in hours
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: default admin account bootstrap
- OTP-related env vars are optional and only needed if you enable OTP endpoints

## 4) Data storage on main server

- Attendance JSON DB: `data/attendance.json`
- Users JSON DB: `data/users.json`
- Captured photos: `uploads/YYYY/MM/DD/*.jpg`
- Monthly archives (per user, per month): `data/monthly-archives/YYYY-MM/`
  - `manifest.json`
  - `<employeeId>-<name>/attendance.json`
  - `<employeeId>-<name>/dtr.html` (printable DTR)

## 5) Important for real-world accuracy

- Use HTTPS in production (camera + geolocation work best on secure origins)
- Keep location services enabled on phones
- Set `MAX_RADIUS_METERS` reasonably for office gate/compound coverage
- Low-quality GPS (`accuracy` too high) is marked `NEEDS_REVIEW`

## 6) API endpoints

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/change-password` (Bearer token required)
- `GET /api/auth/me` (Bearer token required)

Attendance:
- `GET /api/config` (Bearer token required)
- `POST /api/config/office-location` (Admin only)
- `POST /api/attendance` (Bearer token required)
- `GET /api/attendance?date=YYYY-MM-DD` (current logged-in user only)
- `GET /api/admin/attendance?date=YYYY-MM-DD&employeeId=...` (Admin only, all users)
- `POST /api/admin/archive-month` (Admin only, body: `{ "month": "YYYY-MM" }`)
- `GET /api/admin/archive-months` (Admin only)
- `GET /api/admin/archive-month/:month` (Admin only)
- `GET /api/summary/today` (Admin only)

Attendance time windows (Asia/Manila):
- `MORNING_IN` (Morning Time In): 05:00 to 11:30
- `NOON_OUT` (Noon Time Out): 11:31 to 14:00
- `AFTERNOON_OUT` (Afternoon Time Out): 14:01 to 20:00

Only one submission per attendance type per day is allowed for each user.

## 7) Open from phone and public internet (recommended: Render)

For same Wi-Fi access:
- open `http://<PC-LAN-IP>:4000`

For mobile data / other Wi-Fi with one stable link:
- deploy this project to **Render** (free web service)
- Render gives one fixed URL like `https://deped-marinduque-attendance.onrender.com`
- this URL does not change every restart

Quick deploy steps:
1. Push this project to GitHub.
2. Login at Render, click `New +` -> `Blueprint`.
3. Select your repo (this project has `render.yaml` already).
4. Add required environment variables from `.env.example` (at minimum: `AUTH_SECRET`, admin credentials, office coordinates).
5. Deploy and wait until `Live`.
6. Share your Render URL to users (phone/data/any Wi-Fi).

Important:
- Open app in Safari/Chrome (not Messenger in-app browser) to avoid camera/GPS permission blocks.
- Render free plan can sleep on inactivity, but URL stays the same.
- If you need truly 24/7 no-sleep uptime, use a paid plan or keep-alive monitor.

## 8) Installable app now (PWA)

This project is now PWA-enabled.

Users can install it without store:
- Android (Chrome): open app URL -> menu -> `Install app` / `Add to Home screen`
- iPhone (Safari): open app URL -> Share -> `Add to Home Screen`

## 9) Publish to Play Store / App Store

You cannot upload a plain Node web app directly to stores.  
You need a mobile wrapper build (Android/iOS app package), then submit.

Recommended path:
1. Host this app on a stable HTTPS domain/server.
2. Wrap it using Capacitor (WebView app shell).
3. Build signed binaries:
- Android: `.aab` for Google Play
- iOS: archive via Xcode for App Store Connect
4. Submit with your developer accounts:
- Google Play Console (one-time fee)
- Apple Developer Program (annual fee)

If you want, next step I can set up Capacitor files in this project so we can generate Android/iOS builds.

### Capacitor status in this project

- `capacitor.config.ts` added
- Capacitor dependencies installed
- Android platform folder created: `android/`

### Commands available now

```bash
npm run cap:doctor
npm run cap:sync
npm run cap:open:android
```

For iOS (run on macOS only):

```bash
npm run cap:add:ios
npm run cap:open:ios
```

### Important for production mobile app

Before store build, set a stable HTTPS backend URL (not temporary tunnel):

PowerShell example:

```powershell
$env:CAP_SERVER_URL = "https://your-attendance-domain.example"
npm run cap:sync
```

Then open Android Studio/Xcode and create signed release builds for store upload.
