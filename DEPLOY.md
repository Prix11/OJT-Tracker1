# Publish your tracker so the same account works on any device

Your app already supports **cloud sync** through **Firebase**. After you configure it and deploy the site with **HTTPS**, signing in with the same email on a phone or another computer loads the **same hours and history**.

## “Account not found” on another device (Vercel or any host)

That almost always means the app is still in **device-only mode**:

1. **`firebase-config.js` is empty or missing on the server** — Vercel deploys whatever is in your repo. If `apiKey` is blank, the app stores accounts only in **that browser’s storage**. A second device has a **different** storage, so your email is unknown there.

2. **Fix:** Paste your real Firebase web config into `firebase-config.js`, commit, and redeploy. After deploy, open the site: you should see a **green** “Cloud sync is on” banner on the login page. If you see a **yellow** warning about device-only mode, Firebase is still not active.

3. **Add your Vercel domain in Firebase:** **Authentication** → **Settings** → **Authorized domains** → **Add domain** → enter exactly your site host, e.g. `my-app.vercel.app` (no `https://`). Preview URLs like `my-app-git-main-xxx.vercel.app` need to be added too if you use them.

4. **Register again in the cloud:** After Firebase is working, use **Create account** on one device (or sign in if you already created the user in Firebase). Old “local-only” accounts do not automatically move to Firebase; you create/login through Firebase once.

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Add a **Web app** (</> icon) and copy the config object.

## 2. Configure this project

1. Copy `firebase-config.example.js` to `firebase-config.js`.
2. Replace `YOUR_API_KEY`, `projectId`, etc. with the values from the Firebase console.
3. In Firebase:
   - **Authentication** → Sign-in method → enable **Email/Password**.
   - **Firestore Database** → Create database → choose a location → enable.
   - **Firestore** → **Rules** → paste the rules from `firebase-config.example.js` → **Publish**.

## 3. Allow your live website domain (required for production)

Firebase only lets sign-in from approved hosts.

1. **Authentication** → **Settings** → **Authorized domains**.
2. Click **Add domain** and add the host where you host the site, for example:
   - `yoursite.netlify.app`
   - `yoursite.vercel.app`
   - `www.yourdomain.com`
3. `localhost` is already there for local testing.

If you skip this step, login may fail on the real URL with an “unauthorized domain” error.

## 4. Deploy the site

Upload or connect your repo to any **HTTPS** static host. Include at least:

- `index.html`, `time.html`, `history.html`
- `auth.js`, `db.js`, `cloud.js`, `data-api.js`
- `firebase-config.js` (with your real config)
- Firebase loads from Google CDN (already in the HTML)

Do **not** commit real API keys to public GitHub if you want to keep the repo private; use host env secrets or a private config only on the server if you later automate builds.

## 5. Test on two devices

1. Open your **published URL** (not only `file://`).
2. Create an account or sign in.
3. Log the same account on another device or browser — you should see the same totals and history.

If something fails, check the browser **Console** (F12) for Firebase errors and verify **Authorized domains** matches your exact host.
