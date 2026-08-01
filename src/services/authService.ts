import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  sendEmailVerification as fbSendEmailVerification,
  signOut,
  User,
  getAuth
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth, db } from "../lib/firebase";
import { UserProfile } from "../types";

const isNative = () => Capacitor.isNativePlatform();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Robust error handler for Firestore operations as required by the Firebase integration guide.
 * It serializes detailed context for permission denied and other errors into a specific JSON string.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentAuth = getAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth.currentUser?.uid,
      email: currentAuth.currentUser?.email,
      emailVerified: currentAuth.currentUser?.emailVerified,
      isAnonymous: currentAuth.currentUser?.isAnonymous,
      tenantId: currentAuth.currentUser?.tenantId,
      providerInfo: currentAuth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const authService = {
  /**
   * Google Sign-In. Uses the native Google Sign-In SDK via @capacitor-firebase/authentication
   * when running as a packaged app (popup-based sign-in does not work inside a native WebView),
   * then bridges the resulting credential into the Firebase JS SDK so Firestore rules and
   * onAuthStateChanged() see the same signed-in user. Falls back to the web popup flow when
   * running in a regular browser (e.g. `npm run dev`).
   */
  async signInWithGoogle(): Promise<User> {
    try {
      if (isNative()) {
        let result;
        try {
          // Android's Credential Manager API (default) requires Google to recognize the
          // app's install provenance and can fail with "no credentials available" on
          // sideloaded builds that aren't installed via the Play Store. Fall back to the
          // legacy GoogleSignInClient intent-based flow in that case.
          result = await FirebaseAuthentication.signInWithGoogle();
        } catch (credentialManagerErr: any) {
          const msg = String(credentialManagerErr?.message || credentialManagerErr);
          if (msg.toLowerCase().includes("no credentials available")) {
            result = await FirebaseAuthentication.signInWithGoogle({ useCredentialManager: false });
          } else {
            throw credentialManagerErr;
          }
        }
        if (!result.credential?.idToken) {
          throw new Error("Google 로그인에 실패했습니다. 다시 시도해 주세요.");
        }
        const credential = GoogleAuthProvider.credential(result.credential.idToken, result.credential.accessToken);
        const userCred = await signInWithCredential(auth, credential);
        return userCred.user;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error: any) {
      console.error("Google login failed:", error);
      throw error;
    }
  },

  /**
   * Apple Sign-In. Same native-first strategy as signInWithGoogle above.
   */
  async signInWithApple(): Promise<User> {
    try {
      if (isNative()) {
        const result = await FirebaseAuthentication.signInWithApple();
        if (!result.credential?.idToken) {
          throw new Error("Apple 로그인에 실패했습니다. 다시 시도해 주세요.");
        }
        const provider = new OAuthProvider("apple.com");
        const credential = provider.credential({
          idToken: result.credential.idToken,
          rawNonce: result.credential.nonce,
        });
        const userCred = await signInWithCredential(auth, credential);
        return userCred.user;
      }
      const provider = new OAuthProvider("apple.com");
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error: any) {
      console.error("Apple login failed:", error);
      throw error;
    }
  },

  /**
   * Email/password sign-up (new account). Firebase only validates the
   * email's format, not whether the address actually exists - so a
   * verification email is sent immediately, and App.tsx blocks app usage
   * for password-provider accounts until the user clicks the link. An
   * address that doesn't really exist will never receive that email.
   */
  async signUpWithEmail(email: string, password: string): Promise<User> {
    try {
      const result = await fbCreateUserWithEmailAndPassword(auth, email, password);
      try {
        await fbSendEmailVerification(result.user);
      } catch (verifyErr) {
        console.error("Failed to send verification email:", verifyErr);
      }
      return result.user;
    } catch (error: any) {
      console.error("Email sign-up failed:", error);
      throw error;
    }
  },

  /**
   * Email/password sign-in (existing account)
   */
  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const result = await fbSignInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error: any) {
      console.error("Email sign-in failed:", error);
      throw error;
    }
  },

  /**
   * Single entry point for email/password: creates the account if it doesn't
   * exist yet (and signs in), or signs in to the existing account. Tries
   * sign-up first since "email-already-in-use" is a reliable signal even
   * when Firebase's email enumeration protection is on (which can make
   * sign-in's own errors ambiguous about whether the account exists).
   */
  async signInOrSignUpWithEmail(email: string, password: string): Promise<User> {
    try {
      const result = await fbCreateUserWithEmailAndPassword(auth, email, password);
      try {
        await fbSendEmailVerification(result.user);
      } catch (verifyErr) {
        console.error("Failed to send verification email:", verifyErr);
      }
      return result.user;
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        return authService.signInWithEmail(email, password);
      }
      console.error("Email sign-in/sign-up failed:", error);
      throw error;
    }
  },

  /**
   * Re-sends the verification email to the currently signed-in user.
   */
  async resendVerificationEmail(): Promise<void> {
    if (!auth.currentUser) throw new Error("로그인 상태가 아닙니다.");
    await fbSendEmailVerification(auth.currentUser);
  },

  /**
   * Reloads the current user's token and returns the freshest emailVerified
   * status. The `User` object Firebase hands out doesn't update this field
   * in real time - it has to be explicitly refreshed after the user clicks
   * the verification link.
   */
  async refreshEmailVerified(): Promise<boolean> {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    return auth.currentUser.emailVerified;
  },

  /**
   * Sends a password reset email
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await fbSendPasswordResetEmail(auth, email);
    } catch (error: any) {
      console.error("Password reset failed:", error);
      throw error;
    }
  },

  /**
   * Sign Out
   */
  async logout(): Promise<void> {
    try {
      if (isNative()) {
        try {
          await FirebaseAuthentication.signOut();
        } catch (nativeErr) {
          console.warn("Native sign-out failed, continuing with JS SDK sign-out:", nativeErr);
        }
      }
      await signOut(auth);
    } catch (error: any) {
      console.error("Logout failed:", error);
      throw error;
    }
  },

  /**
   * Manages user profile session on login:
   * - If first login: Creates user document in `users/{uid}`
   * - If subsequent login: Updates only `lastLogin`
   * Returns a merged UserProfile for application use.
   */
  async handleUserSession(fbUser: User): Promise<UserProfile> {
    const userDocRef = doc(db, "users", fbUser.uid);
    const path = `users/${fbUser.uid}`;
    
    try {
      const docSnap = await getDoc(userDocRef);
      const now = new Date().toISOString();

      if (!docSnap.exists()) {
        // First login: Create document with required fields
        const providerId = fbUser.providerData[0]?.providerId || "google.com";
        const newUserData = {
          uid: fbUser.uid,
          email: fbUser.email || "",
          displayName: fbUser.displayName || "",
          photoURL: fbUser.photoURL || "",
          provider: providerId,
          createdAt: now,
          lastLogin: now,
        };

        try {
          // Perform creation
          await setDoc(userDocRef, newUserData);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }

        // Return a fully-featured UserProfile for the client with defaults
        return {
          uid: fbUser.uid,
          email: fbUser.email || undefined,
          displayName: fbUser.displayName || undefined,
          photoURL: fbUser.photoURL || undefined,
          name: fbUser.displayName || fbUser.email?.split("@")[0] || "스쿨메이트",
          school: "",
          grade: "",
          classNum: "",
          goal: "",
          avatarUrl: fbUser.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256"
        };
      } else {
        // Subsequent login: Update only lastLogin
        try {
          await updateDoc(userDocRef, {
            lastLogin: now
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }

        const existingData = docSnap.data();
        
        // Return profile merging the database fields and falling back safely
        return {
          uid: fbUser.uid,
          email: fbUser.email || undefined,
          displayName: fbUser.displayName || undefined,
          photoURL: fbUser.photoURL || undefined,
          name: existingData.name || existingData.displayName || fbUser.displayName || fbUser.email?.split("@")[0] || "스쿨메이트",
          school: existingData.school || "",
          schoolCode: existingData.schoolCode,
          officeCode: existingData.officeCode,
          officeName: existingData.officeName,
          schoolKind: existingData.schoolKind,
          grade: existingData.grade || "",
          classNum: existingData.classNum || "",
          goal: existingData.goal || "",
          avatarUrl: existingData.avatarUrl || existingData.photoURL || fbUser.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256"
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
};
