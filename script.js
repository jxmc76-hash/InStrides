import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let logData = {
    types: ["YOGA", "RUN", "GYM", "SWIM"],
    entries: []
};
window.tempMark = 1;

// --- MODAL LOGIC ---
window.showInputModal = () => {
    const select = document.getElementById('modalType');
    select.innerHTML = logData.types.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('inputModal').style.display = 'flex';
    window.selectMark(1);
};

window.closeModal = () => {
    document.getElementById('inputModal').style.display = 'none';
};

window.selectMark = (val) => {
    window.tempMark = val;
    document.querySelectorAll('.mark-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-val') == val);
    });
};

// --- DATA LOGIC ---
window.saveExercise = async () => {
    const entry = {
        type: document.getElementById('modalType').value,
        date: document.getElementById('modalDate').value,
        details: document.getElementById('modalDetails').value,
        mark: window.tempMark,
        id: Date.now()
    };

    if (!entry.date) { alert("Please select a date"); return; }

    logData.entries.push(entry);
    await setDoc(doc(db, "logs", currentLogId), logData);
    window.closeModal();
};

window.manageTypes = async () => {
    const newType = prompt("Enter new exercise type (e.g. CYCLING):");
    if (newType) {
        logData.types.push(newType.toUpperCase());
        await updateDoc(doc(db, "logs", currentLogId), { types: logData.types });
    }
};

// --- RENDER LOGIC ---
const getWeekNumber = (dateString) => {
    const date = new Date(dateString);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - startOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
};

const renderMatrix = () => {
    const headerRow = document.getElementById('headerRow');
    const matrixBody = document.getElementById('matrixBody');

    // Headers
    headerRow.innerHTML = `<th>WEEK</th>` + logData.types.map(t => `<th>${t}</th>`).join('');

    // Grouping
    const weeksMap = {};
    logData.entries.forEach(entry => {
        const wNum = getWeekNumber(entry.date);
        if (!weeksMap[wNum]) weeksMap[wNum] = {};
        if (!weeksMap[wNum][entry.type]) weeksMap[wNum][entry.type] = [];
        weeksMap[wNum][entry.type].push(entry);
    });

    // Rows
    matrixBody.innerHTML = "";
    const sortedWeeks = Object.keys(weeksMap).sort((a, b) => b - a);

    sortedWeeks.forEach(w => {
        let rowHtml = `<tr><td>WEEK ${w}</td>`;
        logData.types.forEach(type => {
            const items = weeksMap[w][type] || [];
            const content = items.map(item => `
                <div class="entry-card">
                    <strong>${item.date.split('-').reverse().slice(0,2).join('/')}</strong>
                    ${item.details}
                    <div class="entry-mark">${item.mark}/3</div>
                </div>
            `).join('');
            rowHtml += `<td><div class="cell-content">${content}</div></td>`;
        });
        rowHtml += `</tr>`;
        matrixBody.innerHTML += rowHtml;
    });
};

// --- INIT ---
onSnapshot(doc(db, "logs", currentLogId), (snap) => {
    if (snap.exists()) {
        logData = snap.data();
        renderMatrix();
    } else {
        setDoc(doc(db, "logs", currentLogId), logData);
    }
});
