import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const LOG_ID = "single-master-log";
let logData = { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] };
let editingId = null;
window.tempMark = 1;
let currentBin = { food: false, web: false };

// --- Tab Navigation ---
window.switchTab = (tab) => {
    document.getElementById('viewLog').classList.toggle('active', tab === 'log');
    document.getElementById('viewInsights').classList.toggle('active', tab === 'insights');
    document.getElementById('tabLog').classList.toggle('active', tab === 'log');
    document.getElementById('tabInsights').classList.toggle('active', tab === 'insights');
    
    if (tab === 'insights') renderInsights();
};

// --- Insights Logic ---
const renderInsights = () => {
    const totalEntries = logData.entries.length;
    if (totalEntries === 0) {
        document.getElementById('activityChart').innerHTML = "<p style='text-align:center; color:#94a3b8; padding:20px;'>No data to analyze yet.</p>";
        return;
    }

    let sumHappy = 0, countHappy = 0, foodYes = 0, webYes = 0, workCount = 0;
    const typeMap = {};
    logData.types.forEach(t => typeMap[t] = 0);

    logData.entries.forEach(e => {
        if (e.happiness) { sumHappy += e.happiness; countHappy++; }
        if (e.food) foodYes++;
        if (e.web) webYes++;
        if (e.type && e.type !== "NONE") {
            workCount++;
            typeMap[e.type] = (typeMap[e.type] || 0) + 1;
        }
    });

    document.getElementById('statHappy').innerText = countHappy ? (sumHappy/countHappy).toFixed(1) : '-';
    document.getElementById('statFood').innerText = Math.round((foodYes/totalEntries)*100) + '%';
    document.getElementById('statWeb').innerText = Math.round((webYes/totalEntries)*100) + '%';
    document.getElementById('statTotal').innerText = workCount;

    const chart = document.getElementById('activityChart');
    const maxVal = Math.max(...Object.values(typeMap), 1);
    chart.innerHTML = logData.types.map(t => {
        const count = typeMap[t] || 0;
        const pct = (count / maxVal) * 100;
        return `
            <div class="bar-row">
                <div class="bar-label">${t}</div>
                <div class="bar-outer"><div class="bar-inner" style="width:${pct}%"></div></div>
                <div style="width:20px; font-weight:800; font-size:0.7rem;">${count}</div>
            </div>
        `;
    }).join('');
};

// --- Toggles & Modals ---
window.toggleBin = (key, val) => {
    currentBin[key] = val;
    document.getElementById(`${key}Yes`).classList.toggle('active', val);
    document.getElementById(`${key}No`).classList.toggle('active', !val);
};

window.showInputModal = () => {
    editingId = null;
    document.getElementById('deleteEntryBtn').style.display = "none";
    document.getElementById('modalDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalHappiness').value = 5;
    document.getElementById('happyVal').innerText = 5;
    window.toggleBin('food', false); window.toggleBin('web', false);
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
};

window.editEntry = (id) => {
    const entry = logData.entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('deleteEntryBtn').style.display = "block";
    document.getElementById('modalDate').value = entry.date;
    document.getElementById('modalHappiness').value = entry.happiness || 5;
    document.getElementById('happyVal').innerText = entry.happiness || 5;
    window.toggleBin('food', !!entry.food); window.toggleBin('web', !!entry.web);
    document.getElementById('modalDetails').value = entry.details || "";
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
        food: currentBin.food, web: currentBin.web,
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark, id: editingId || Date.now()
    };
    if (editingId) {
        const idx = logData.entries.findIndex(e => e.id === editingId);
        logData.entries[idx] = entryData;
    } else {
        logData.entries.push(entryData);
    }
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.closeModal('inputModal');
};

window.deleteEntry = async () => {
    if (confirm("Delete entry?")) {
        logData.entries = logData.entries.filter(e => e.id !== editingId);
        await setDoc(doc(db, "logs", LOG_ID), logData);
        window.closeModal('inputModal');
    }
};

// --- Type Management UI Initialization Fix ---
window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    if (!container || !logData.types) return;
    
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1; padding:6px; border:1px solid #ddd; border-radius:6px;">
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.65rem; padding:4px 10px;">Rename</button>
            <button onclick="window.removeType(${idx})" style="background:#fee2e2; color:#ef4444; font-size:0.65rem; padding:4px 10px;" class="nav-btn">✕</button>
        </div>
    `).join('');
    document.getElementById('typeModal').style.display = 'flex';
};

window.addType = async () => {
    const input = document.getElementById('newTypeInput');
    if (!input) return;
    const val = input.value.toUpperCase().trim();
    if (val && !logData.types.includes(val)) {
        logData.types.push(val);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        input.value = "";
        window.showTypeModal();
    }
};

window.renameType = async (idx) => {
    const old = logData.types[idx];
    const targetInput = document.getElementById(`type-input-${idx}`);
    if (!targetInput) return;
    const n = targetInput.value.toUpperCase().trim();
    if (!n || n === old) return;
    
    logData.types[idx] = n;
    logData.entries = logData.entries.map(e => e.type === old ? { ...e, type: n } : e);
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.showTypeModal();
};

window.removeType = async (idx) => {
    if (confirm(`Delete Category?`)) {
        logData.types.splice(idx, 1);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        window.showTypeModal();
    }
};

// --- Matrix Rendering Engine ---
const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    if (!body || !header) return;
    
    header.innerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th><th class="col-stat">Food</th><th class="col-stat">Web</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, food: false, web: false, exercises: {} };
        if (e.happiness) entriesByDate[e.date].happiness = e.happiness;
        entriesByDate[e.date].food = e.food; entriesByDate[e.date].web = e.web;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const today = new Date();

    body.innerHTML = "";
    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey] || { happiness: null, food: false, web: false, exercises: {} };
        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });

        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${dayData.happiness ? `<div class="happy-pill">${dayData.happiness}</div>` : ''}</td>
            <td class="col-stat">${dayData.food ? '✅' : '❌'}</td>
            <td class="col-stat">${dayData.web ? '✅' : '❌'}</td>`;
            
        logData.types.forEach(type => {
            const exercise = dayData.exercises[type] ? dayData.exercises[type][0] : null;
            row += `<td>${exercise ? `<div class="tick-cell" onclick="window.editEntry(${exercise.id})">✓</div>` : ''}</td>`;
        });
        body.innerHTML += row + `</tr>`;
        if (dayOfWeek === 1) body.innerHTML += `<tr style="background:#f8fafc; height:4px;"><td colspan="50"></td></tr>`;
    }
};

window.closeModal = (id) => { document.getElementById(id).style.display = 'none'; };
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderMatrix(); if(document.getElementById('viewInsights').classList.contains('active')) renderInsights(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
});
