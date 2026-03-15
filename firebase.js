import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    getDoc, 
    setDoc,
    query, 
    orderBy,
    updateDoc,
    deleteDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9LDSyd2x2n4Dt6PIQJjLrAltDBWgT2Do",
    authDomain: "mensagem-2f134.firebaseapp.com",
    projectId: "mensagem-2f134",
    storageBucket: "mensagem-2f134.firebasestorage.app",
    messagingSenderId: "1001126917394",
    appId: "1:1001126917394:web:7069c87f494af89cf66fcb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { 
    auth, db, googleProvider, signInWithPopup, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut, sendPasswordResetEmail, collection, addDoc, getDocs, doc, getDoc, setDoc,
    query, orderBy, updateDoc, deleteDoc, where 
};
