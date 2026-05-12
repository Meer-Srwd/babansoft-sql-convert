# SQL Converter

A minimal SaaS MVP that converts SQL queries between PostgreSQL, MySQL, and SQL Server using a rule-based conversion engine.

## Project Structure

```text
BabanSoft SqlConvert/
├─ backend/
│  ├─ package.json
│  └─ src/
│     ├─ app.js
│     ├─ index.js
│     ├─ controllers/
│     │  └─ convertController.js
│     ├─ routes/
│     │  └─ convertRoutes.js
│     └─ services/
│        └─ conversion/
│           ├─ index.js
│           ├─ pairs/
│           │  ├─ mysqlToPostgres.js
│           │  ├─ mysqlToSqlServer.js
│           │  ├─ postgresToMySql.js
│           │  ├─ postgresToSqlServer.js
│           │  ├─ sqlServerToMySql.js
│           │  └─ sqlServerToPostgres.js
│           └─ shared/
│              └─ transformers.js
└─ frontend/
   ├─ index.html
   ├─ package.json
   ├─ vite.config.js
   └─ src/
      ├─ App.jsx
      ├─ main.jsx
      ├─ styles.css
      ├─ api/
      │  └─ convertSql.js
      └─ data/
         └─ sampleQueries.js
```

## Run Locally

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

The API runs on `http://localhost:3001`.

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The Vite app runs on `http://localhost:5173` and proxies `POST /convert` to the backend.

## API

### `POST /convert`

Request body:

```json
{
  "query": "SELECT * FROM users LIMIT 10;",
  "fromDb": "postgresql",
  "toDb": "sqlserver"
}
```

Response body:

```json
{
  "convertedQuery": "SELECT TOP 10 * FROM [users];"
}
```

## Notes

- The conversion engine is intentionally rule-based and modular so new database pairs or syntax rules can be added without rewriting the API.
- This MVP focuses on common syntax differences such as `LIMIT` and `TOP`, `AUTO_INCREMENT` and `SERIAL`, boolean handling, and `NOW()` versus `GETDATE()`.

## Deploy On Vercel

This project is configured for a Vercel split deployment:

- the Vite frontend is built from `frontend/`
- the Express backend runs through Vercel Node functions in `api/`
- the frontend calls `/api/*` paths directly, and local Vite development proxies `/api` back to the backend on port 3001

### Required Vercel environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_APP_URL`

`PUBLIC_APP_URL` must be the final public app origin, for example:

```text
https://sqlconvert.yourdomain.com
```

### Supabase auth redirects

In Supabase Auth URL settings, add your Vercel or custom domain to:

- Site URL
- Redirect URLs

Allow callback URLs like:

```text
https://sqlconvert.yourdomain.com/?auth=confirm
https://sqlconvert.yourdomain.com/?auth=reset-password
```
