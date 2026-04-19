import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, updateDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
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
const PIN = "1234";

let currentProject = "fast-5k";
let localRuns = [];
let unsubscribe = null;

// --- AUTH HELPERS ---
window.isAdmin = () => sessionStorage.getItem('isAdmin') === 'true';
window.openLogin = () => document.getElementById('login-overlay').style.display = 'flex';
window.closeLogin = () => document.getElementById('login-overlay').style.display = 'none';
window.checkPin = () => {
    if (document.getElementById('pinInput').value === PIN) {
        sessionStorage.setItem('isAdmin', 'true');
        location.reload();
    } else alert("Wrong PIN");
};

// --- DISPLAY HELPERS ---
window.getPlanDisplayName = (id) => {
    const plans = {
        "fast-5k": "🏃‍♂️ fast 5k",
        "marathon": "👟 marathon",
        "intervals": "⚡️ intervals"
    };
    return plans[id] || `🏃‍♂️ ${id.replace(/-/g, ' ')}`;
};

// --- CORE APP LOGIC ---
window.loadProject = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;
    
    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        if (!snap.exists()) return;
        localRuns = snap.data().runs || [];
        renderApp();
    });
};

const renderApp = () => {
    const listContainer = document.getElementById('runList');
    const heroContainer = document.querySelector('.latest-run-hero');
    listContainer.innerHTML = "";

    if (window.isAdmin()) {
        document.getElementById('admin-ui').style.display = 'block';
        document.getElementById('admin-lock').innerText = "🔓";
    }

    // 1. Update the "Latest Run" Hero (Finding the most recent @done)
    const completedRuns = localRuns.filter(r => r.includes("@done"));
    if (completedRuns.length > 0) {
        const latest = completedRuns[completedRuns.length - 1];
        const task = latest.replace(/@w\d+/gi, "").replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim();
        const dateMatch = latest.match(/@date\((.*?)\)/i);
        
        heroContainer.innerHTML = `
            <div class="strava-card premium">
                <h4>Latest Run</h4>
                <h2>${task}</h2>
                <div class="card-footer">
                    <span class="run-date">Completed ${dateMatch ? dateMatch[1] : 'Recently'}</span>
                    <a href="#" class="view-strava">View Strava →</a>
                </div>
            </div>
        `;
    }

    // 2. Render the "Current" List
    localRuns.forEach((runStr, index) => {
        const isDone = runStr.includes("@done");
        const dateMatch = runStr.match(/@date\((.*?)\)/i);
        const cleanText = runStr.replace(/@w\d+/gi, "").replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim();
        const weekMatch = runStr.match(/@w(\d+)/i);
        const weekNum = weekMatch ? weekMatch[1] : "1";

        const li = document.createElement('li');
        li.setAttribute('data-index', index);
        li.setAttribute('data-week', weekNum);
        if (isDone) li.classList.add('done');

        li.innerHTML = `
            <div class="task-info" onclick="window.toggleDone(${index})">
                <span class="task-text">${cleanText}</span>
                ${dateMatch ? `<span class="completion-date">Done: ${dateMatch[1]}</span>` : ""}
            </div>
            ${window.isAdmin() ? `<button onclick="window.deleteRun(${index})">✕</button>` : ""}
        `;
        listContainer.appendChild(li);
    });

    // 3. Initialize Drag & Drop
    if (window.isAdmin()) {
        new Sortable(listContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: window.saveNewOrder
        });
    }

    window.syncDropdown();
};

window.saveNewOrder = async () => {
    const updatedRuns = [];
    document.querySelectorAll('#runList li').forEach(li => {
        const task = li.querySelector('.task-text').innerText;
        const weekNum = li.getAttribute('data-week');
        const isDone = li.classList.contains('done');
        const dateSpan = li.querySelector('.completion-date');
        
        let str = `${task} @w${weekNum}`;
        if (isDone) str += " @done";
        if (dateSpan) str += ` @date(${dateSpan.innerText.replace('Done: ', '')})`;
        updatedRuns.push(str);
    });
    await updateDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
};

window.toggleDone = async (index) => {
    if (!window.isAdmin()) return; // Only admin can check things off
    const runs = [...localRuns];
    let run = runs[index];

    if (run.includes("@done")) {
        run = run.replace(/@done/g, "").replace(/@date\(.*?\)/g, "").trim();
    } else {
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        run = `${run} @done @date(${dateStr})`;
    }

    runs[index] = run;
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.addRun = async () => {
    const input = document.getElementById('runInput');
    if (!input.value) return;
    const newRuns = [...localRuns, input.value];
    await updateDoc(doc(db, "plans", currentProject), { runs: newRuns });
    input.value = "";
};

window.deleteRun = async (index) => {
    if (!confirm("Delete?")) return;
    const runs = [...localRuns];
    runs.splice(index, 1);
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.syncDropdown = async () => {
    const select = document.getElementById('projectSelect');
    const querySnapshot = await getDocs(collection(db, "plans"));
    
    if (select.options.length !== querySnapshot.size) {
        select.innerHTML = "";
        querySnapshot.forEach((doc) => {
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.innerText = window.getPlanDisplayName(doc.id);
            opt.selected = (doc.id === currentProject);
            select.appendChild(opt);
        });
    }
};

window.handleProjectChange = (id) => window.loadProject(id);

// --- START APP ---
window.loadProject(currentProject);


