import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, setDoc, collection, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// --- LOG CONTROLS ---
const syncLogDropdown = async () => {
    const dropdown = document.getElementById('logDropdown');
    const querySnapshot = await getDocs(collection(db, "logs"));
    let options = `<option value="OVERVIEW" ${isOverviewMode ? 'selected' : ''}>Master Overview</option>`;
    querySnapshot.forEach((doc) => {
        const id = doc.id;
        options += `<option value="${id}" ${(!isOverviewMode && currentLogId === id) ? 'selected' : ''}>Log: ${id}</option>`;
    });
    dropdown.innerHTML = options;
};

window.handleLogSelect = (val) => {
    if (val === "OVERVIEW") loadOverview();
    else { isOverviewMode = false; initApp(val); }
};

window.addNewLog = async () => {
    const name = prompt("New log name:");
    if (name) initApp(name.toLowerCase().replace(/\s+/g, '-').trim());
};

window.deleteCurrentLog = async () => {
    if (isOverviewMode || currentLogId === "main-log") return;
    if (confirm(`Delete "${currentLogId}"?`)) {
        await deleteDoc(doc(db, "logs", currentLogId));
        initApp("main-log");
    }
};

// --- DATA LOGIC ---
window.showInputModal = () => {
    if (isOverviewMode) return;
    editingId = null;
    document.getElementById('modalTitle').innerText = "Daily Log";
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
};

window.editEntry = (id) => {
    const entry = logData.entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('modalTitle').innerText = "Edit Entry";
    document.getElementById('deleteEntryBtn').style.display = "block";
    document.getElementById('modalDate').value = entry.date;
    document.getElementById('modalHappiness').value = entry.happiness || 5;
    document.getElementById('happyVal').innerText = entry.happiness || 5;
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('modalDetails').value = entry.details || "";
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark,
        id: editingId || Date.now()
    };
    
    if (editingId) {
        const idx = logData.entries.findIndex(e => e.id === editingId);
        logData.entries[idx] = entryData;
    } else {
        logData.entries.push(entryData);
    }
    
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal('inputModal');
};

// --- RENDER LOGIC ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th>Date</th><th class="sticky-col">Happiness</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    if (logData.entries.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="padding:40px; text-align:center;">No data yet.</td></tr>`;
        return;
    }

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: 0, exercises: {} };
        entriesByDate[e.date].happiness = e.happiness;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const sortedDates = Object.keys(entriesByDate).sort((a,b) => new Date(a) - new Date(b));
    const firstDate = new Date(sortedDates[0]);
    const today = new Date();

    body.innerHTML = "";
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
        const dayData = entriesByDate[dateKey] || { happiness: '-', exercises: {} };

        let row = `<tr>
            <td>${displayDate}</td>
            <td class="sticky-col">${dayData.happiness !== '-' ? `<div class="happy-pill">${dayData.happiness}</div>` : '-'}</td>`;
            
        logData.types.forEach(type => {
            const exercises = dayData.exercises[type] || [];
            const content = exercises.map(ex => `
                <div class="entry-pill int-${ex.mark}" onclick="window.editEntry(${ex.id})">
                    <p class="entry-desc">${ex.details || 'Activity'}</p>
                </div>
            `).join('');
            row += `<td>${content}</td>`;
        });
        row += `</tr>`;
        body.innerHTML += row;
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

const initApp = (logId) => {
    if (unsubscribe) unsubscribe();
    currentLogId = logId;
    unsubscribe = onSnapshot(doc(db, "logs", logId), (snap) => {
        if (snap.exists()) { logData = snap.data(); renderMatrix(); syncLogDropdown(); }
        else { setDoc(doc(db, "logs", logId), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
    });
};

initApp(currentLogId);
