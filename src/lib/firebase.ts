import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  User
} from "firebase/auth";
import { 
  initializeFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  updateDoc 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDh9mrhvYSDgrN7WUzMW_WSO670z5OTjWE",
  authDomain: "gen-lang-client-0685740024.firebaseapp.com",
  projectId: "gen-lang-client-0685740024",
  storageBucket: "gen-lang-client-0685740024.firebasestorage.app",
  messagingSenderId: "725925538766",
  appId: "1:725925538766:web:239579d8522e514ea8d99f"
};

const app = initializeApp(firebaseConfig);

// Explicit persistence list (rather than the default auto-detection) avoids a hang some
// WKWebView/Capacitor setups hit while Firebase Auth probes for IndexedDB support on launch.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, "ai-studio-22fbd27c-5516-4028-bd17-a6d4ba99710b");

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup
};
export type { User };
