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
  apiKey: "AIzaSyDNXbnKnqtPDf8qooP1QbNUZiaB1_nnU28",
  authDomain: "ttesteiiot.firebaseapp.com",
  databaseURL: "https://ttesteiiot-default-rtdb.firebaseio.com",
  projectId: "ttesteiiot",
  storageBucket: "ttesteiiot.firebasestorage.app",
  messagingSenderId: "409552243589",
  appId: "1:409552243589:web:cff0bf04598995e28812ec",
  measurementId: "G-5MV5VPG3VF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Realtime Database instance (exportado para uso em main.js)
const db = getDatabase(app);
export { app, db };