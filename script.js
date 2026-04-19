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
let unsubscribe = null;

// Run Rename
window.renameRun = async (index) => {
    const raw = localRuns[index];
    const currentText = raw.replace(/@w\d+/gi, "").replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    const newName = prompt("Rename run:", currentText);
    if (newName && newName !== currentText) {
        let runs = [...localRuns];
        const metadata = raw.match(/@\w+(\(.*?\))?/g);
        const metaStr = metadata ? metadata.join(" ") : "";
        runs[index] = `${newName} ${metaStr}`.trim();
        await updateDoc(doc(db, "plans", currentProject), { runs });
    }
};

window.toggleDone = async (i) => {
    let runs = [...localRuns];
    if (runs[i].includes("@done")) {
        runs[i] = runs[i].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
    } else {
        const d = new Date();
        const dateStr = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
        runs[i] = `${runs[i]} @done @date(${dateStr})`;
    }
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.deleteRun = async (i) => {
    if (!confirm("Delete this run?")) return;
    let runs = [...localRuns];
    runs.splice(i, 1);
    await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.archiveProject = async () => {
    if (!confirm("Archive this plan?")) return;
    await updateDoc(doc(db, "plans", currentProject), { archived: true });
};

window.restartProject = async () => {
    if (!confirm("Reset all progress?")) return;
    const cleaned = localRuns.map(r => r.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim());
    await updateDoc(doc(db, "plans", currentProject), { runs: cleaned });
};

window.renameProject = async () => {
    const newName = prompt("Enter new plan name:");
    if (!newName) return;
    const newId = newName.toLowerCase().replace(/\s+/g, '-');
    const oldSnap = await getDocs(collection(db, "plans"));
    const oldData = oldSnap.docs.find(d => d.id === currentProject).data();
    await setDoc(doc(db, "plans", newId), { ...oldData });
    await deleteDoc(doc(db, "plans", currentProject));
    window.handleProjectChange(newId);
};

window.deleteProject = async () => {
    if (!confirm("PERMANENTLY delete this plan?")) return;
    await deleteDoc(doc(db, "plans", currentProject));
    location.reload();
};

const renderApp = () => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";
    const groups = {};
    localRuns.forEach((runStr, index) => {
        const weekMatch = runStr.match(/@w(\d+)/i);
        const weekNum = weekMatch ? weekMatch[1] : "1";
        if (!groups[weekNum]) groups[weekNum] = [];
        groups[weekNum].push({ raw: runStr, index });
    });

    Object.keys(groups).sort((a,b) => a - b).forEach(week => {
        const title = document.createElement('h3');
        title.className = "section-title";
        title.innerText = `WEEK ${week}`;
        listContainer.appendChild(title);
        const ul = document.createElement('ul');
        ul.className = "current-list";
        ul.setAttribute('data-week', week);
        groups[week].forEach(item => {
            const isDone = item.raw.includes("@done");
            const dateMatch = item.raw.match(/@date\((.*?)\)/i);
            const cleanText = item.raw.replace(/@w\d+/gi, "").replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim();
            const li = document.createElement('li');
            if (isDone) li.classList.add('done');
            li.innerHTML = `
                <div style="flex:1;">
                    <span class="task-text" onclick="window.toggleDone(${item.index})" ondblclick="window.renameRun(${item.index})">
                        ${cleanText}
                    </span>
                    ${dateMatch ? `<span class="completion-date">DONE: ${dateMatch[1]}</span>` : ""}
                </div>
                <button class="delete-btn" onclick="window.deleteRun(${item.index})">✕</button>
            `;
            ul.appendChild(li);
        });
        listContainer.appendChild(ul);
        new Sortable(ul, { group: 'shared', animation: 150, onEnd: window.saveNewOrder });
    });
};

window.saveNewOrder = async () => {
    const updated = [];
    document.querySelectorAll('.current-list').forEach(ul => {
        const week = ul.getAttribute('data-week');
        ul.querySelectorAll('li').forEach(li => {
            const text = li.querySelector('.task-text').innerText;
            const done = li.classList.contains('done') ? " @done" : "";
            const dateSpan = li.querySelector('.completion-date');
            const date = dateSpan ? ` @date(${dateSpan.innerText.replace('DONE: ', '')})` : "";
            updated.push(`${text} @w${week}${done}${date}`);
        });
    });
    await updateDoc(doc(db, "plans", currentProject), { runs: updated });
};

window.addRun = async () => {
    const input = document.getElementById('runInput');
    if (!input.value) return;
    await updateDoc(doc(db, "plans", currentProject), { runs: [...localRuns, input.value] });
    input.value = "";
};

window.syncDropdown = async () => {
    const select = document.getElementById('projectSelect');
    const showArchived = document.getElementById('showArchived').checked;
    const snap = await getDocs(collection(db, "plans"));
    select.innerHTML = "";
    snap.forEach(d => {
        const data = d.data();
        if (!data.archived || showArchived) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.innerText = d.id.replace(/-/g, ' ').toUpperCase();
            opt.selected = (d.id === currentProject);
            select.appendChild(opt);
        }
    });
};

window.handleProjectChange = (id) => {
    if (unsubscribe) unsubscribe();
    currentProject = id;
    unsubscribe = onSnapshot(doc(db, "plans", id), (snap) => {
        if (snap.exists()) { localRuns = snap.data().runs || []; renderApp(); }
    });
    window.syncDropdown();
};

window.handleProjectChange(currentProject);

