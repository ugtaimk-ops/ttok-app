import { initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
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
// popupRedirectResolver is required for signInWithPopup (the web/localhost Google
// sign-in path) - initializeAuth() doesn't wire it up by default the way getAuth()
// does, and without it signInWithPopup throws auth/argument-error. Native builds sign
// in through the Capacitor plugin instead, so this has no effect on them.
// On iOS, IndexedDB inside the Capacitor WKWebView can leave Auth's initialization (and so
// signInWithCredential / onAuthStateChanged) pending forever, so use localStorage only there.
const isIos = Capacitor.getPlatform() === "ios";
export const auth = initializeAuth(app, {
  persistence: isIos ? [browserLocalPersistence] : [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Firestore's default WebChannel streaming transport can hang indefinitely inside
  // iOS WKWebView; this lets the SDK detect that and fall back to long polling.
  experimentalAutoDetectLongPolling: true
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
