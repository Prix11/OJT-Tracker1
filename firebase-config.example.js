/**
 * SETUP FOR ANY DEVICE + PUBLISHED WEBSITE
 * =========================================
 * 1. Copy this file to firebase-config.js (same folder as index.html).
 * 2. Paste your real values from Firebase Console → Project settings → Your apps → Web.
 * 3. Enable Email/Password: Authentication → Sign-in method.
 * 4. Create Firestore: Firestore Database → Create database (production mode), then paste rules below.
 * 5. IMPORTANT — when your site is on the internet:
 *    Firebase Console → Authentication → Settings → Authorized domains
 *    → Add your live URL host (e.g. myapp.netlify.app, www.yoursite.com).
 *    Localhost is already allowed for testing.
 * 6. Deploy all HTML + JS files including firebase-config.js to HTTPS hosting
 *    (Netlify, Vercel, Firebase Hosting, GitHub Pages, etc.).
 *
 * Firestore security rules (Firestore → Rules → Publish):
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /users/{userId}/{document=**} {
 *       allow read, write: if request.auth != null && request.auth.uid == userId;
 *     }
 *   }
 * }
 *
 * The Firebase "apiKey" in the web config is safe to ship in public pages; access is enforced by rules above.
 */
window.OJT_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};
