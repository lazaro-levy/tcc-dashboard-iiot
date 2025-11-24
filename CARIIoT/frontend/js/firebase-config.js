// Import the functions you need from the Firebase CDN (ES modules)
// Using explicit URLs so the browser can load modules without a bundler
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBpVa5Lz50VFufUxQjiXM9ijLBj5pNkX0o",
  authDomain: "cariiot.firebaseapp.com",
  databaseURL: "https://cariiot-default-rtdb.firebaseio.com/",
  projectId: "cariiot",
  storageBucket: "cariiot.firebasestorage.app",
  messagingSenderId: "997696975740",
  appId: "1:997696975740:web:eb0bfcd79e5e2e41612af9",
  measurementId: "G-BECGM1P3KH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Realtime Database instance (exportado para uso em main.js)
const db = getDatabase(app);
export { app, db };