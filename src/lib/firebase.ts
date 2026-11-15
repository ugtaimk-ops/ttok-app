import { initializeApp } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import {
  initializeAuth,
  connectAuthEmulator,
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
  connectFirestoreEmulator,
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

const emulatorMode=(import.meta as any).env.DEV&&(import.meta as any).env.VITE_USE_FIREBASE_EMULATORS==='true';
// Local four-phone preview shares Firebase persistence only within each pair.
const previewDevice=(import.meta as any).env.DEV ? new URLSearchParams(location.search).get('previewDevice') : null;
const previewName=previewDevice==='left'||previewDevice==='right' ? 'ddok-timer-'+previewDevice : undefined;
const app = initializeApp(emulatorMode?{...firebaseConfig,projectId:'demo-ddok-shared',apiKey:'demo-api-key',authDomain:'localhost'}:firebaseConfig, previewName);

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

if ((import.meta as any).env.DEV && (import.meta as any).env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  connectFirestoreEmulator(db,'127.0.0.1',8080);
}

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
