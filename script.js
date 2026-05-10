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
    document.getElementById('modalDetails').value = "";
    document.getElementById('modalPhoto').value = "";
    window.toggleBin('food', false);
    window.toggleBin('web', false);
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
    document.getElementById('modalDetails').value = entry.details || "";
    document.getElementById('modalPhoto').value = entry.photo || "";
    window.toggleBin('food', !!entry.food);
    window.toggleBin('web', !!entry.web);
    document.getElementById('modalType').innerHTML = `<option value="NONE">No Exercise</option>` + logData.types.map(t => `<option value="${t}" ${t === entry.type ? 'selected' : ''}>${t}</option>`).join('');
    window.selectMark(entry.mark || 1);
    document.getElementById('inputModal').style.display = 'flex';
};

window.saveExercise = async () => {
    const entryData = {
        date: document.getElementById('modalDate').value,
        happiness: parseInt(document.getElementById('modalHappiness').value),
        food: currentBin.food,
        web: currentBin.web,
        type: document.getElementById('modalType').value,
        details: document.getElementById('modalDetails').value,
        photo: document.getElementById('modalPhoto').value,
        mark: window.tempMark,
        id: editingId || Date.now()
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

window.showTypeModal = () => {
    const container = document.getElementById('typeList');
    container.innerHTML = logData.types.map((type, idx) => `
        <div class="type-item" style="display:flex; gap:5px; margin-bottom:8px;">
            <input type="text" value="${type}" id="type-input-${idx}" style="flex:1; padding:8px;">
            <button onclick="window.renameType(${idx})" class="nav-btn btn-secondary" style="font-size:0.6rem">Rename</button>
            <button onclick="window.removeType(${idx})" class="nav-btn btn-secondary" style="color:red; font-size:0.6rem">✕</button>
        </div>
    `).join('');
    document.getElementById('typeModal').style.display = 'flex';
};

window.addType = async () => {
    const input = document.getElementById('newTypeInput');
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
    const n = document.getElementById(`type-input-${idx}`).value.toUpperCase().trim();
    if (!n || n === old) return;
    logData.types[idx] = n;
    logData.entries = logData.entries.map(e => e.type === old ? { ...e, type: n } : e);
    await setDoc(doc(db, "logs", LOG_ID), logData);
    window.showTypeModal();
};

window.removeType = async (idx) => {
    if (confirm(`Delete category?`)) {
        logData.types.splice(idx, 1);
        await updateDoc(doc(db, "logs", LOG_ID), { types: logData.types });
        window.showTypeModal();
    }
};

const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th><th class="col-stat">Food</th><th class="col-stat">Web</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, food: false, web: false, exercises: {} };
        if (typeof e.happiness === 'number') entriesByDate[e.date].happiness = e.happiness;
        entriesByDate[e.date].food = e.food || false;
        entriesByDate[e.date].web = e.web || false;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    // Calculate first entry date or default to 14 days ago to ensure we see history
    const firstEntryDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date(Date.now() - 14 * 86400000);
    const today = new Date();

    body.innerHTML = "";
    let weekStats = { hap: [], food: 0, web: 0, work: 0 };

    for (let d = new Date(today); d >= firstEntryDate; d.setDate(d.getDate() - 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        const dayData = entriesByDate[dateKey] || { happiness: null, food: false, web: false, exercises: {} };

        if (dayData.happiness !== null) weekStats.hap.push(dayData.happiness);
        if (dayData.food) weekStats.food++;
        if (dayData.web) weekStats.web++;
        Object.values(dayData.exercises).forEach(l => weekStats.work += l.length);

        const displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
        let row = `<tr>
            <td class="col-date">${displayDate}</td>
            <td class="col-stat">${dayData.happiness !== null ? `<div class="happy-pill">${dayData.happiness}</div>` : ''}</td>
            <td class="col-stat"><span class="status-icon">${dayData.food ? '✅' : '❌'}</span></td>
            <td class="col-stat"><span class="status-icon">${dayData.web ? '✅' : '❌'}</span></td>`;
            
        logData.types.forEach(type => {
            const exercises = dayData.exercises[type] || [];
            const content = exercises.map(ex => `
                <div class="entry-pill int-${ex.mark}" onclick="window.editEntry(${ex.id})">
                    <p class="entry-desc">${ex.details || 'View'}</p>
                    ${ex.photo ? `<img src="${ex.photo}" class="entry-thumb" onerror="this.style.display='none'">` : ''}
                </div>
            `).join('');
            row += `<td>${content}</td>`;
        });
        body.innerHTML += row + `</tr>`;

        if (dayOfWeek === 1) { // Monday Summary
            const avgH = weekStats.hap.length ? (weekStats.hap.reduce((a,b)=>a+b,0)/weekStats.hap.length).toFixed(1) : '-';
            body.innerHTML += `
                <tr style="background:#f8fafc; font-weight:800; font-size:0.65rem; color:#64748b; text-transform:uppercase;">
                    <td>Weekly Review</td>
                    <td class="col-stat">AVG: ${avgH}</td>
                    <td class="col-stat">YES: ${weekStats.food}</td>
                    <td class="col-stat">YES: ${weekStats.web}</td>
                    <td colspan="${logData.types.length}">Total: ${weekStats.work}</td>
                </tr>`;
            weekStats = { hap: [], food: 0, web: 0, work: 0 };
        }
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.selectMark = (v) => { window.tempMark = v; document.querySelectorAll('.rate-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-val') == v)); };

onSnapshot(doc(db, "logs", LOG_ID), (snap) => {
    if (snap.exists()) { logData = snap.data(); renderMatrix(); }
    else { setDoc(doc(db, "logs", LOG_ID), { types: ["RUN", "YOGA", "GYM", "SWIM"], entries: [] }); }
});
