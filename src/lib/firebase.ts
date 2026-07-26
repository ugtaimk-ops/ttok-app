import { initializeApp } from "firebase/app";
import { 
  getAuth, 
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

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
});

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
