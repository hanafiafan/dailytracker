// Penghubung ke Firebase (login Google + database Firestore).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

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
