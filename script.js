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

const renderMatrix = () => {
    const body = document.getElementById('matrixBody');
    const header = document.getElementById('headerRow');
    header.innerHTML = `<th class="col-date">Date</th><th class="col-stat">Happiness</th><th class="col-stat">Food</th><th class="col-stat">Web</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    const entriesByDate = {};
    logData.entries.forEach(e => {
        if (!entriesByDate[e.date]) entriesByDate[e.date] = { happiness: null, food: false, web: false, exercises: {} };
        if (typeof e.happiness === 'number') entriesByDate[e.date].happiness = e.happiness;
        entriesByDate[e.date].food = e.food;
        entriesByDate[e.date].web = e.web;
        if (e.type !== "NONE") {
            if (!entriesByDate[e.date].exercises[e.type]) entriesByDate[e.date].exercises[e.type] = [];
            entriesByDate[e.date].exercises[e.type].push(e);
        }
    });

    const dates = Object.keys(entriesByDate).sort((a,b) => new Date(b) - new Date(a));
    const firstDate = dates.length > 0 ? new Date(dates[dates.length-1]) : new Date();
    const today = new Date();

    body.innerHTML = "";
    let weekStats = { hap: [], food: 0, web: 0, work: 0 };

    for (let d = new Date(today); d >= firstDate; d.setDate(d.getDate() - 1)) {
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

        if (dayOfWeek === 1) {
            const avgH = weekStats.hap.length ? (weekStats.hap.reduce((a,b)=>a+b,0)/weekStats.hap.length).toFixed(1) : '-';
            body.innerHTML += `
                <tr style="background:#f8fafc; font-weight:800; font-size:0.7rem; color:#64748b; text-transform:uppercase;">
                    <td>Weekly Review</td>
                    <td class="col-stat">AVG: ${avgH}</td>
                    <td class="col-stat">YES: ${weekStats.food}</td>
                    <td class="col-stat">YES: ${weekStats.web}</td>
                    <td colspan="${logData.types.length}">Total Activity: ${weekStats.work}</td>
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
