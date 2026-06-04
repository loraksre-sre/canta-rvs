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

// ── Reservaciones ────────────────────────────────────────────
export async function getReservaciones() {
  const snap = await getDocs(
    query(collection(db, "reservaciones"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

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
export async function getReportes() {
  const snap = await getDocs(
    query(collection(db, "reportes"), orderBy("generadoEl", "desc"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveReporte(reporte) {
  await setDoc(doc(db, "reportes", reporte.id), reporte);
}

export function subscribeReportes(callback) {
  return onSnapshot(
    query(collection(db, "reportes"), orderBy("generadoEl", "desc")),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}
