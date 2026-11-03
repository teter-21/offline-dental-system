# Local-only setup

No Cloudinary, Brevo, SMTP, Render, or Aiven integrations are required.

1. Install Node.js 22 or 24 and a local MySQL server (Laragon/XAMPP).
2. Import `database/clinic_db_core_fresh.sql` using phpMyAdmin.
3. Copy `.env.example` to `.env`, set your local database credentials and a strong random JWT_SECRET.
4. In the project root run `npm install` then `npm start`.
5. In `front-end`, run `npm install` then `npm run dev`.
6. Open http://localhost:5173/login.

Patient images are saved under `back-end/storage/patient-images/` and served via an authenticated `/patient-images/:id` route. Back up this directory along with your MySQL database. Do not expose it with static file hosting.

Email-based password resets are disabled because there is no local mail transport. Administrators can change passwords through Settings while logged in. If locked out, use a controlled offline bcrypt reset rather than weakening authentication.
