# IoT Report Lokal

Struktur proyek sudah dirapikan menjadi dua aplikasi utama:

- `backend/` untuk API Django + PostgreSQL
- `frontend/` untuk UI Next.js

## Struktur Folder

```text
iot_report_lokal/
├─ backend/
│  ├─ config/            # Django project config (settings, urls, wsgi, asgi)
│  ├─ core/              # App utama (models, serializers, views, urls, migrations)
│  ├─ manage.py
│  ├─ requirements.txt
│  ├─ .env
│  └─ .env.example
├─ frontend/
│  ├─ app/               # Halaman dashboard, errors, devices, installations
│  ├─ components/        # Komponen UI bersama (navbar, dll)
│  ├─ lib/               # API client dan type
│  ├─ public/
│  ├─ package.json
│  └─ .env.local.example
├─ schema.prisma
└─ README.md
```

## Menjalankan Backend

```powershell
cd d:\Apps\iot_report_lokal
.venv\Scripts\activate
pip install -r backend\requirements.txt
cd backend
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Format `backend/.env` harus `KEY=VALUE` (bukan `$env:...`):

```env
DB_NAME=iot_reports
DB_USER=postgres
DB_PASSWORD=your_real_postgres_password
DB_HOST=localhost
DB_PORT=5432
```

## Authentication

Backend menyediakan endpoint:

- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `GET /api/auth/me/`
- `POST /api/auth/logout/`

Gunakan header:

```http
Authorization: Bearer <token>
```

## Menjalankan Frontend

```powershell
cd d:\Apps\iot_report_lokal\frontend
npm install
npm run dev
```

## Menjalankan dengan Docker

Di root project, buat file `.env` (opsional; bisa salin dari `.env.example`):

```bash
cp .env.example .env
# Edit .env jika perlu (DB_PASSWORD, SECRET_KEY, dll.)
```

Lalu jalankan:

```bash
docker compose up -d --build
```

- **Frontend:** http://localhost:3000  
- **Backend API:** http://localhost:8000/api  
- **PostgreSQL:** localhost:5432 (user/password dari `.env`)

Perintah lain:

- `docker compose logs -f backend` — lihat log backend  
- `docker compose down` — stop semua service (volume data DB dan media tetap)  
- `docker compose up -d --build` — rebuild dan jalankan ulang
