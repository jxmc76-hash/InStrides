import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC_VBffGyCoopsZZiPTZowx8d7fhFQ8_-w",
    authDomain: "in-strides.firebaseapp.com",
    projectId: "in-strides",
    storageBucket: "in-strides.firebasestorage.app",
    messagingSenderId: "974987405170",
    appId: "1:974987405170:web:c1f100b44bb85efed7dfeb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentLogId = "main-log";
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] };
let editingId = null; 
let unsubscribe = null;
let isOverviewMode = false;
window.tempMark = 1;

// --- MASTER OVERVIEW ---
const loadOverview = async () => {
    isOverviewMode = true;
    document.getElementById('viewIndicator').innerText = "Mode: MASTER OVERVIEW (Read-Only)";
    
    const querySnapshot = await getDocs(collection(db, "logs"));
    const masterData = { types: new Set(), entries: [] };
    
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        (data.types || []).forEach(t => masterData.types.add(t));
        masterData.entries = [...masterData.entries, ...(data.entries || [])];
    });
    
    logData = {
        types: Array.from(masterData.types),
        entries: masterData.entries
    };
    renderMatrix();
};

window.changeLog = () => {
    const name = prompt("Enter log name (or type 'OVERVIEW'):", currentLogId);
    if (!name) return;
    
    if (name.toUpperCase() === 'OVERVIEW') {
        loadOverview();
    } else if (name !== currentLogId) {
        isOverviewMode = false;
        initApp(name);
    }
};

// --- MODAL CONTROLS ---
window.showInputModal = () => {
    if (isOverviewMode) return alert("Switch to a specific log to add entries.");
    editingId = null;
    document.getElementById('modalTitle').innerText = "Log Entry";
    document.getElementById('submitEntryBtn').innerText = "Save Workout";
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalType').innerHTML = logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
};

window.editEntry = (id) => {
    if (isOverviewMode) return alert("Editing is disabled in Overview mode.");
    const entry = logData.entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('modalTitle').innerText = "Edit Entry";
    document.getElementById('submitEntryBtn').innerText = "Update Workout";
    document.getElementById('deleteEntryBtn').style.display = "block";
    document.getElementById('modalType').innerHTML = logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('modalDate').value = entry.date;
    document.getElementById('modalDetails').value = entry.details;
    window.selectMark(entry.mark);
    document.getElementById('inputModal').style.display = 'flex';
};

window.closeModal = () => { document.getElementById('inputModal').style.display = 'none'; };

window.selectMark = (val) => {
    window.tempMark = val;
    document.querySelectorAll('.rate-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-val') == val);
    });
};

// --- DATA ACTIONS ---
window.saveExercise = async () => {
    const entryData = {
        type: document.getElementById('modalType').value,
        date: document.getElementById('modalDate').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark,
        id: editingId || Date.now()
    };
    if (!entryData.date) return alert("Select a date.");
    if (editingId) {
        const idx = logData.entries.findIndex(e => e.id === editingId);
        logData.entries[idx] = entryData;
    } else {
        logData.entries.push(entryData);
    }
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal();
};

window.deleteEntry = async () => {
    if (!confirm("Delete this entry?")) return;
    logData.entries = logData.entries.filter(e => e.id !== editingId);
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal();
};

window.manageTypes = async () => {
    if (isOverviewMode) return alert("Switch to a specific log to manage types.");
    const t = prompt("New exercise type:");
    if (t) {
        logData.types.push(t.toUpperCase());
        await updateDoc(doc(db, "logs", currentLogId), { types: logData.types });
    }
};

// --- RENDER ---
const getMonday = (dStr) => {
    const d = new Date(dStr);
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(d.setDate(diff));
    return mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th>Week Starting</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const weeksMap = {};
    logData.entries.forEach(e => {
        const mon = getMonday(e.date);
        if (!weeksMap[mon]) weeksMap[mon] = {};
        if (!weeksMap[mon][e.type]) weeksMap[mon][e.type] = [];
        weeksMap[mon][e.type].push(e);
    });

    body.innerHTML = "";
    const sortedMondays = Object.keys(weeksMap).sort((a, b) => new Date(b) - new Date(a));

    sortedMondays.forEach(mon => {
        let row = `<tr><td>${mon}</td>`;
        logData.types.forEach(type => {
            const items = weeksMap[mon][type] || [];
            const cards = items.map(i => `
                <div class="entry-pill int-${i.mark}" ${isOverviewMode ? '' : `onclick="window.editEntry(${i.id})"`}>
                    <span class="entry-date">${i.date.split('-').reverse().slice(0,2).join('/')}</span>
                    <p class="entry-desc">${i.details || 'Activity'}</p>
                    <div class="entry-mark-tag">${i.mark === 1 ? 'Recovery' : i.mark === 2 ? 'Moderate' : 'High Intensity'}</div>
                </div>
            `).join('');
            row += `<td>${cards}</td>`;
        });
        body.innerHTML += row + `</tr>`;
    });
};

const initApp = (logId) => {
    if (unsubscribe) unsubscribe();
    currentLogId = logId;
    document.getElementById('viewIndicator').innerText = `Current Log: ${logId}`;
    unsubscribe = onSnapshot(doc(db, "logs", logId), (snap) => {
        if (snap.exists()) { 
            logData = snap.data(); 
            renderMatrix(); 
        } else { 
            setDoc(doc(db, "logs", logId), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); 
        }
    });
};

initApp(currentLogId);
