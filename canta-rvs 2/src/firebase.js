import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDvkCZgnl9K7DaNstj0LlRQawitHi8stjQ",
  authDomain: "canta-corazon-gto-rsv.firebaseapp.com",
  projectId: "canta-corazon-gto-rsv",
  storageBucket: "canta-corazon-gto-rsv.firebasestorage.app",
  messagingSenderId: "936502809112",
  appId: "1:936502809112:web:1c9c54be53a16e3495296d",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ── Login por rol ────────────────────────────────────────────
// Mapea cada perfil (staff/supervisor/admin) a una cuenta real de
// Firebase Authentication. Esto es lo que permite que las reglas de
// seguridad de Firestore verifiquen quién hace cada petición.
const ROLE_CREDENTIALS = {
  staff:      { email: "staff@canta.local",      password: "CantaStaff_2026!" },
  supervisor: { email: "supervisor@canta.local",  password: "CantaSuper_2026!" },
  admin:      { email: "admin@canta.local",       password: "CantaAdmin_2026!" },
};

export async function loginConRol(rol) {
  const cred = ROLE_CREDENTIALS[rol];
  if (!cred) throw new Error("Rol inválido");
  await signInWithEmailAndPassword(auth, cred.email, cred.password);
}

export function logoutRol() {
  return signOut(auth);
}

// ── Reservaciones ────────────────────────────────────────────
export async function saveReservacion(reservacion) {
  await setDoc(doc(db, "reservaciones", reservacion.id), reservacion);
}

export async function deleteReservacion(id) {
  await deleteDoc(doc(db, "reservaciones", id));
}

export function subscribeReservaciones(callback) {
  return onSnapshot(
    query(collection(db, "reservaciones"), orderBy("createdAt", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// ── Reportes ─────────────────────────────────────────────────
export async function saveReporte(reporte) {
  await setDoc(doc(db, "reportes", reporte.id), reporte);
}

export function subscribeReportes(callback) {
  return onSnapshot(
    query(collection(db, "reportes"), orderBy("generadoEl", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// ── Mapa de mesas (tiempo real) ───────────────────────────────
// Guardamos todo el estado del mapa en un solo documento por piso/cuartos
// para minimizar escrituras y tener sync instantáneo

export async function saveMapa(tipo, data) {
  // tipo: "p1" | "p2" | "cuartos"
  await setDoc(doc(db, "mapa", tipo), { data, updatedAt: new Date().toISOString() });
}

export function subscribeMapa(tipo, callback) {
  return onSnapshot(doc(db, "mapa", tipo), (snap) => {
    if (snap.exists()) {
      callback(snap.data().data);
    } else {
      callback(null);
    }
  });
}
