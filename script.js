import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, updateDoc, onSnapshot, collection, getDocs, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let currentProject = "fast-5k";
let localRuns = [];
let chartInstance = null;

const updateVisuals = () => {
    const stats = { "🏃": 0, "🚲": 0, "🏋️": 0, "🏊": 0 };
    const activeDays = new Set();

    localRuns.forEach(run => {
        if (run.includes("@done")) {
            const type = run.match(/[🏃🚲🏋️🏊]/);
            if (type) stats[type[0]]++;
            const dateMatch = run.match(/@date\((\d+)\s/);
            if (dateMatch) activeDays.add(dateMatch[1]);
        }
    });

    const ctx = document.getElementById('performanceChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Run', 'Cycle', 'Gym', 'Swim'],
            datasets: [{
                data: Object.values(stats),
                backgroundColor: ['#ff5500', '#007aff', '#4cd964', '#ffcc00'],
                borderWidth: 0
            }]
        },
        options: { cutout: '70%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = "";
    for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.getDate().toString();
        const div = document.createElement('div');
        div.className = `cal-day ${activeDays.has(dayStr) ? 'active' : ''}`;
        div.innerText = dayStr;
        grid.appendChild(div);
    }
};

window.addRun = async () => {
    const input = document.getElementById('runInput');
    const type = document.getElementById('exerciseType').value;
    if (!input.value) return;
    await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, `${type} ${input.value}`] });
    input.value = "";
};

window.setScore = async (idx, s) => {
    let runs = [...localRuns];
    runs[idx] = runs[idx].replace(/@score\(\d+\)/, "").trim() + ` @score(${s})`;
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.toggleDone = async (i) => {
    let runs = [...localRuns];
    if (runs[i].includes("@done")) {
        runs[i] = runs[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").replace(/@score\(.*?\)/gi, "").trim();
    } else {
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        runs[i] = `${runs[i]} @done @date(${dateStr})`;
    }
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.handleProjectChange = (id) => {
    currentProject = id;
    onSnapshot(doc(db, "plans", id), (snap) => {
        if (snap.exists()) { 
            localRuns = snap.data().runs || []; 
            renderApp();
            updateVisuals();
        }
    });
};

const renderApp = () => {
    const list = document.getElementById('runList');
    list.innerHTML = "";
    localRuns.forEach((run, i) => {
        const isDone = run.includes("@done");
        const score = run.match(/@score\((\d+)\)/)?.[1];
        const li = document.createElement('li');
        if (isDone) li.classList.add('done');
        li.innerHTML = `
            <div class="task-text" onclick="window.toggleDone(${i})">${run.split('@')[0]}</div>
            ${isDone ? `
                <div class="score-picker">
                    <div class="score-btn ${score=='1'?'active':''}" onclick="window.setScore(${i},1)">EASY</div>
                    <div class="score-btn ${score=='2'?'active':''}" onclick="window.setScore(${i},2)">MOD</div>
                    <div class="score-btn ${score=='3'?'active':''}" onclick="window.setScore(${i},3)">HARD</div>
                </div>` : ''}
        `;
        list.appendChild(li);
    });
};

window.handleProjectChange(currentProject);
