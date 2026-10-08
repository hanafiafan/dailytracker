// Penghubung ke Firebase (login Google + database Firestore).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getMessaging, getToken, deleteToken, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { firebaseConfig, VAPID_KEY } from "./config.js";

const cfg = { ...firebaseConfig };
// On Firebase Hosting, sign in through the app's own domain so the login works inside installed apps too.
const host = location.hostname;
if (host.endsWith(".web.app") || host.endsWith(".firebaseapp.com")) cfg.authDomain = host;

const app = initializeApp(cfg);
let fs;
try {
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  fs = initializeFirestore(app, {});
}
const auth = getAuth(app);

const META = { includeMetadataChanges: true };
const wrapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
const wrapQuery = q => ({ docs: q.docs.map(wrapDoc), size: q.size, empty: q.empty, metadata: q.metadata });

function docRef(path) {
  const r = doc(fs, path);
  return {
    id: r.id, path,
    get: async () => wrapDoc(await getDoc(r)),
    set: (data, opts) => setDoc(r, data, opts || {}),
    update: data => updateDoc(r, data),
    delete: () => deleteDoc(r),
    onSnapshot: (next, err) => onSnapshot(r, META, s => next(wrapDoc(s)), err),
    collection: sub => colRef(path + "/" + sub),
  };
}
function queryRef(base, cons) {
  const q = cons.length ? query(base, ...cons) : base;
  return {
    where: (f, op, v) => queryRef(base, [...cons, where(f, op, v)]),
    get: async () => wrapQuery(await getDocs(q)),
    onSnapshot: (next, err) => onSnapshot(q, META, s => next(wrapQuery(s)), err),
  };
}
function colRef(path) {
  const c = collection(fs, path);
  return {
    ...queryRef(c, []), path,
    doc: id => docRef(path + "/" + (id || doc(c).id)),
    add: async data => { const r = await addDoc(c, data); return docRef(path + "/" + r.id); },
  };
}
export const db = { doc: docRef, collection: colRef };

getRedirectResult(auth).catch(e => console.warn("redirect", e));
export const onUser = cb => onAuthStateChanged(auth, cb);
export async function signIn() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  const standaloneIOS = window.navigator.standalone === true;
  if (standaloneIOS) return signInWithRedirect(auth, p);
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment" || e.code === "auth/web-storage-unsupported")) {
      return signInWithRedirect(auth, p);
    }
    throw e;
  }
}
export const signOutUser = () => signOut(auth);

// ---------- push notifications ----------
// Each device registers its FCM token under tokens/<email>/devices/<token>; the Cloud Functions read it to send pushes.
export async function pushSupported() { try { return await isSupported(); } catch (_) { return false; } }
export async function registerPush(email) {
  if (!VAPID_KEY) throw new Error("no-vapid");
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error("no-token");
  await db.doc(`tokens/${email}/devices/${token}`).set({ at: Date.now(), ua: navigator.userAgent.slice(0, 120) });
  return token;
}
export async function unregisterPush(email) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) { await db.doc(`tokens/${email}/devices/${token}`).delete(); await deleteToken(getMessaging(app)); }
  } catch (e) { console.warn("unregister", e); }
}
export const idToken = () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
