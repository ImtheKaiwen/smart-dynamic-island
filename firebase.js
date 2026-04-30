const { initializeApp } = require('firebase/app');
const { getFirestore, doc, onSnapshot, updateDoc, setDoc, Timestamp } = require('firebase/firestore');
require('dotenv').config();

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MY_ID = process.env.CLIENT_ID || 'Client_A';
const TARGET_ID = MY_ID === 'Client_A' ? 'Client_B' : 'Client_A';

/**
 * Listen for events targeted to this client
 * @param {Function} callback - Function to call when an event is received
 */
function listenForEvents(callback) {
    const docRef = doc(db, 'islands', MY_ID);
    
    // Initial setup if doc doesn't exist
    setDoc(docRef, { status: 'online', lastActive: Timestamp.now() }, { merge: true });

    return onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (data.event) {
                callback(data.event);
                // Clear the event after processing to avoid re-triggering
                updateDoc(docRef, { event: null });
            }
        }
    });
}

/**
 * Send an event to the target client
 * @param {Object} eventData - Data to send (type, message, actions, etc.)
 */
async function sendEventToTarget(eventData) {
    const targetRef = doc(db, 'islands', TARGET_ID);
    await updateDoc(targetRef, {
        event: {
            ...eventData,
            timestamp: Timestamp.now()
        }
    });
}

module.exports = {
    listenForEvents,
    sendEventToTarget,
    MY_ID,
    TARGET_ID
};
