import { 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithPopup, 
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
import { auth, db } from "../lib/firebase";
import { UserProfile } from "../types";

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
   * Google Sign-In via popup
   */
  async signInWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    // Prompt to select account
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error: any) {
      console.error("Google login failed:", error);
      throw error;
    }
  },

  /**
   * Apple Sign-In via popup
   */
  async signInWithApple(): Promise<User> {
    const provider = new OAuthProvider('apple.com');
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error: any) {
      console.error("Apple login failed:", error);
      throw error;
    }
  },

  /**
   * Sign Out
   */
  async logout(): Promise<void> {
    try {
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
          school: "서울과학고등학교",
          grade: "2",
          classNum: "4",
          goal: "수행평가 All A 달성 및 발표 마스터",
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
          school: existingData.school || "서울과학고등학교",
          schoolCode: existingData.schoolCode,
          officeCode: existingData.officeCode,
          officeName: existingData.officeName,
          schoolKind: existingData.schoolKind,
          grade: existingData.grade || "2",
          classNum: existingData.classNum || "4",
          goal: existingData.goal || "수행평가 All A 달성 및 발표 마스터",
          avatarUrl: existingData.avatarUrl || existingData.photoURL || fbUser.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256",
          allergies: existingData.allergies
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
};
