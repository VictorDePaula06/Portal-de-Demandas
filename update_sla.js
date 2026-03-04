import admin from 'firebase-admin';

// NOTE: You would need to provide a service account key JSON file to run this locally
// var serviceAccount = require("./path/to/serviceAccountKey.json");
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// But since we are connected to firestore from the front-end, let's write a quick JS
// snippet that we can execute via the browser console or inject temporarily into app.js
