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

// --- TYPE MANAGEMENT ---
window.showTypeModal = () => {
    if (isOverviewMode) return alert("Select a specific log to manage types.");
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item">
            <input type="text" value="${type}" id="type-input-${idx}">
            <button onclick="window.renameType(${idx})" class="btn-icon save">RENAME</button>
            <button onclick="window.removeType(${idx})" class="btn-icon del">✕</button>
        </div>
    `).join('');
    document.getElementById('typeModal').style.display = 'flex';
};

window.addType = async () => {
    const input = document.getElementById('newTypeInput');
    const val = input.value.toUpperCase().trim();
    if (val && !logData.types.includes(val)) {
        logData.types.push(val);
        await updateDoc(doc(db, "logs", currentLogId), { types: logData.types });
        input.value = "";
        window.showTypeModal();
    }
};

window.renameType = async (idx) => {
    const oldType = logData.types[idx];
    const newType = document.getElementById(`type-input-${idx}`).value.toUpperCase().trim();
    if (!newType || newType === oldType) return;

    // Update the type list
    logData.types[idx] = newType;
    // Update all entries that had the old type
    logData.entries = logData.entries.map(e => e.type === oldType ? { ...e, type: newType } : e);
    
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.showTypeModal();
};

window.removeType = async (idx) => {
    if (!confirm(`Delete "${logData.types[idx]}"? (Entries will be hidden unless you recreate the type)`)) return;
    logData.types.splice(idx, 1);
    await updateDoc(doc(db, "logs", currentLogId), { types: logData.types });
    window.showTypeModal();
};

// --- LOG CONTROLS ---
const syncLogDropdown = async () => {
    const dropdown = document.getElementById('logDropdown');
    const querySnapshot = await getDocs(collection(db, "logs"));
    let options = `<option value="OVERVIEW" ${isOverviewMode ? 'selected' : ''}>Master Overview</option>`;
    querySnapshot.forEach((doc) => {
        const id = doc.id;
        options += `<option value="${id}" ${(!isOverviewMode && currentLogId === id) ? 'selected' : ''}>Log: ${id.replace(/-/g, ' ')}</option>`;
    });
    dropdown.innerHTML = options;
};

window.handleLogSelect = (val) => {
    if (val === "OVERVIEW") { loadOverview(); } 
    else { isOverviewMode = false; initApp(val); }
};

window.addNewLog = async () => {
    const name = prompt("New log name:");
    if (name) initApp(name.toLowerCase().replace(/\s+/g, '-').trim());
};

window.deleteCurrentLog = async () => {
    if (isOverviewMode) return;
    if (confirm(`Delete log "${currentLogId}"?`)) {
        await deleteDoc(doc(db, "logs", currentLogId));
        initApp("main-log");
    }
};

const loadOverview = async () => {
    isOverviewMode = true;
    document.getElementById('deleteLogBtn').style.display = "none";
    const snap = await getDocs(collection(db, "logs"));
    const master = { types: new Set(), entries: [] };
    snap.forEach(d => {
        const data = d.data();
        (data.types || []).forEach(t => master.types.add(t));
        master.entries = [...master.entries, ...(data.entries || [])];
    });
    logData = { types: Array.from(master.types), entries: master.entries };
    renderMatrix();
    syncLogDropdown();
};

// --- ENTRY MODALS ---
window.showInputModal = () => {
    if (isOverviewMode) return alert("Select a specific log.");
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
    if (isOverviewMode) return;
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

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };

window.selectMark = (val) => {
    window.tempMark = val;
    document.querySelectorAll('.rate-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-val') == val));
};

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
    window.closeModal('inputModal');
};

window.deleteEntry = async () => {
    if (!confirm("Delete entry?")) return;
    logData.entries = logData.entries.filter(e => e.id !== editingId);
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal('inputModal');
};

// --- RENDERING ---
const getMondayDate = (dStr) => {
    const d = new Date(dStr);
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(d.setDate(diff));
    return mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th>Week Starting</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const weeksMap = {};
    logData.entries.forEach(e => {
        const mon = getMondayDate(e.date);
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
                    <span class="entry-date">${i.date.split('-').reverse().join('/')}</span>
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
    document.getElementById('deleteLogBtn').style.display = "flex";
    unsubscribe = onSnapshot(doc(db, "logs", logId), (snap) => {
        if (snap.exists()) { 
            logData = snap.data(); 
            renderMatrix(); 
            syncLogDropdown();
        } else { 
            setDoc(doc(db, "logs", logId), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); 
        }
    });
};

initApp(currentLogId);
