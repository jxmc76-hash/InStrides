import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, updateDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE INITIALIZATION ---
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

// --- AUTHENTICATION ---
window.isAdmin = () => sessionStorage.getItem('isAdmin') === 'true';
window.openLogin = () => document.getElementById('login-overlay').style.display = 'flex';
window.closeLogin = () => document.getElementById('login-overlay').style.display = 'none';

window.checkPin = () => {
    const input = document.getElementById('pinInput').value;
    if (input === PIN) {
        sessionStorage.setItem('isAdmin', 'true');
        location.reload(); // Reload to activate admin events
    } else {
        alert("Incorrect PIN");
    }
};

// --- CORE RENDERING ENGINE ---
const renderApp = () => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";

    // Show Admin UI if unlocked
    if (window.isAdmin()) {
        const adminUI = document.getElementById('admin-ui');
        if (adminUI) adminUI.style.display = 'block';
        document.getElementById('admin-lock').innerText = "🔓";
    }

    // 1. Group the runs by Week (@w1, @w2, etc.)
    const groups = {};
    localRuns.forEach((runStr, index) => {
        const weekMatch = runStr.match(/@w(\d+)/i);
        const weekNum = weekMatch ? weekMatch[1] : "1";
        if (!groups[weekNum]) groups[weekNum] = [];
        groups[weekNum].push({ raw: runStr, index: index });
    });

    // 2. Sort and Render each Week Group
    Object.keys(groups).sort((a, b) => a - b).forEach(week => {
        // Create Week Heading
        const title = document.createElement('h3');
        title.className = "section-title";
        title.innerText = `Week ${week}`;
        listContainer.appendChild(title);

        // Create the List for this week
        const ul = document.createElement('ul');
        ul.className = "current-list";
        ul.setAttribute('data-week', week);

        groups[week].forEach(item => {
            const isDone = item.raw.includes("@done");
            const dateMatch = item.raw.match(/@date\((.*?)\)/i);
            const cleanText = item.raw
                .replace(/@w\d+/gi, "")
                .replace(/@done/gi, "")
                .replace(/@date\(.*?\)/gi, "")
                .trim();

            const li = document.createElement('li');
            if (isDone) li.classList.add('done');
            
            li.innerHTML = `
                <div style="flex:1; cursor:pointer;" onclick="window.toggleDone(${item.index})">
                    <span class="task-text">${cleanText}</span>
                    ${dateMatch ? `<span class="completion-date">DONE: ${dateMatch[1]}</span>` : ""}
                </div>
                ${window.isAdmin() ? `<button class="delete-btn" onclick="window.deleteRun(${item.index})">✕</button>` : ""}
            `;
            ul.appendChild(li);
        });

        listContainer.appendChild(ul);

        // 3. Initialize Drag & Drop for this list (Admins only)
        if (window.isAdmin()) {
            new Sortable(ul, {
                group: 'shared-weeks', // Allows dragging between different weeks
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: window.saveNewOrder
            });
        }
    });

    window.syncDropdown();
};

// --- DATABASE ACTIONS ---

// Toggle the completion status
window.toggleDone = async (i) => {
    if (!window.isAdmin()) return; // Only allow changes if unlocked
    
    let runs = [...localRuns];
    if (runs[i].includes("@done")) {
        // Un-complete
        runs[i] = runs[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    } else {
        // Mark as complete with today's date
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        runs[i] = `${runs[i]} @done @date(${dateStr})`;
    }
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

// Rebuild strings based on the DOM order after a drag
window.saveNewOrder = async () => {
    const updated = [];
    document.querySelectorAll('.current-list').forEach(ul => {
        const weekNum = ul.getAttribute('data-week');
        ul.querySelectorAll('li').forEach(li => {
            const text = li.querySelector('.task-text').innerText;
            const isDone = li.classList.contains('done');
            const dateSpan = li.querySelector('.completion-date');
            
            let runStr = `${text} @w${weekNum}`;
            if (isDone) runStr += " @done";
            if (dateSpan) {
                const dateClean = dateSpan.innerText.replace('DONE: ', '');
                runStr += ` @date(${dateClean})`;
            }
            updated.push(runStr);
        });
    });
    await updateDoc(doc(db, "plans", currentProject), { runs: updated });
};

// Add a new run to the current plan
window.addRun = async () => {
    const input = document.getElementById('runInput');
    if (!input.value) return;
    const newRuns = [...localRuns, input.value];
    await updateDoc(doc(db, "plans", currentProject), { runs: newRuns });
    input.value = "";
};

// Delete a run
window.deleteRun = async (i) => {
    if (!confirm("Delete this run?")) return;
    let runs = [...localRuns];
    runs.splice(i, 1);
    await updateDoc(doc(db, "plans", currentProject), { runs: runs });
};

// Sync the plan names in the dropdown
window.syncDropdown = async () => {
    const select = document.getElementById('projectSelect');
    const snap = await getDocs(collection(db, "plans"));
    
    if (select.options.length !== snap.size) {
        select.innerHTML = "";
        snap.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.innerText = d.id.replace(/-/g, ' ').toUpperCase();
            opt.selected = (d.id === currentProject);
            select.appendChild(opt);
        });
    }
};

// Handle Plan switching
window.handleProjectChange = (id) => window.loadProject(id);

// Load Plan and listen for real-time updates
window.loadProject = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;
    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        if (snap.exists()) {
            localRuns = snap.data().runs || [];
            renderApp();
        }
    });
};

// Wipe progress (remove @done tags)
window.restartProject = async () => {
    if (!confirm("Reset all progress for this plan?")) return;
    const cleaned = localRuns.map(r => 
        r.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim()
    );
    await updateDoc(doc(db, "plans", currentProject), { runs: cleaned });
};

// --- INITIAL START ---
window.loadProject(currentProject);


