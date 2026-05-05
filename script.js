import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
window.tempMark = 1;

// --- MODAL CONTROLS ---
window.showInputModal = () => {
    editingId = null;
    document.getElementById('modalTitle').innerText = "Log Entry";
    document.getElementById('submitEntryBtn').innerText = "Save Workout";
    document.getElementById('deleteEntryBtn').style.display = "none";
    
    // Clear fields
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalDetails').value = "";
    
    document.getElementById('modalType').innerHTML = logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
};

window.editEntry = (id) => {
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

    if (!entryData.date) return alert("Please select a date.");

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
    if (!confirm("Delete this entry permanently?")) return;
    logData.entries = logData.entries.filter(e => e.id !== editingId);
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal();
};

window.manageTypes = async () => {
    const t = prompt("Add new exercise type:");
    if (t) {
        logData.types.push(t.toUpperCase());
        await updateDoc(doc(db, "logs", currentLogId), { types: logData.types });
    }
};

// --- RENDER ---
const getWeekNumber = (dStr) => {
    const d = new Date(dStr);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
};

const renderMatrix = () => {
    const header = document.getElementById('headerRow');
    const body = document.getElementById('matrixBody');
    header.innerHTML = `<th>Week</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const weeksMap = {};
    logData.entries.forEach(e => {
        const w = getWeekNumber(e.date);
        if (!weeksMap[w]) weeksMap[w] = {};
        if (!weeksMap[w][e.type]) weeksMap[w][e.type] = [];
        weeksMap[w][e.type].push(e);
    });

    body.innerHTML = "";
    Object.keys(weeksMap).sort((a,b) => b-a).forEach(w => {
        let row = `<tr><td>W${w}</td>`;
        logData.types.forEach(type => {
            const items = weeksMap[w][type] || [];
            const cards = items.map(i => `
                <div class="entry-pill" onclick="window.editEntry(${i.id})">
                    <span class="entry-date">${i.date.split('-').reverse().slice(0,2).join('/')}</span>
                    <p class="entry-desc">${i.details || 'No notes'}</p>
                    <span class="entry-mark-tag">${i.mark}/3 Intensity</span>
                </div>
            `).join('');
            row += `<td>${cards}</td>`;
        });
        body.innerHTML += row + `</tr>`;
    });
};

onSnapshot(doc(db, "logs", currentLogId), (snap) => {
    if (snap.exists()) { 
        logData = snap.data(); 
        renderMatrix(); 
    } else { 
        setDoc(doc(db, "logs", currentLogId), logData); 
    }
});
