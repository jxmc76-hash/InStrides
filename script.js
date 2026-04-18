import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let unsubscribe = null;
let localRuns = [];

const toTitleCase = (str) => {
    return str.replace(/-/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

window.syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  const showArchived = document.getElementById('showArchived').checked;
  
  let optionsHtml = "";
  let firstAvailable = null;

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const isArchived = data.archived || false;
    if (!firstAvailable && !isArchived) firstAvailable = doc.id;
    if (showArchived || !isArchived) {
        const display = toTitleCase(doc.id);
        optionsHtml += `<option value="${doc.id}">${isArchived ? '📁 ' : '🏃‍♂️ '}${display}</option>`;
    }
  });
  
  select.innerHTML = optionsHtml + `<option value="ADD_NEW">+ Add new plan...</option>`;
  
  const currentExists = querySnapshot.docs.some(d => d.id === currentProject);
  if (!currentExists) {
      currentProject = firstAvailable || "fast-5k";
  }
  select.value = currentProject;
};

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  currentProject = projectId;
  const docRef = doc(db, "plans", projectId);
  
  unsubscribe = onSnapshot(docRef, (docSnap) => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";
    if (!docSnap.exists()) return;
    
    const data = docSnap.data();
    localRuns = data.runs || [];
    document.getElementById('archiveBtn').innerText = data.archived ? "Unarchive" : "Archive";

    const groups = {};
    localRuns.forEach((run, index) => {
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const label = weekMatch ? `Week ${weekMatch[1]}` : "Current";
      if (!groups[label]) groups[label] = [];
      groups[label].push({ text: run, originalIndex: index });
    });

    Object.keys(groups).sort((a,b) => {
        if(a === "Current") return -1;
        if(b === "Current") return 1;
        return parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''));
    }).forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');
      groups[week].forEach((item) => {
        const li = document.createElement('li');
        if (item.text.includes("@done")) li.classList.add('done');
        const dateMatch = item.text.match(/@date\((.*?)\)/i);
        const cleanText = item.text.replace(/@w(?:eek)?\s?\(?(\d+)\)?/gi, "").replace(/@date\(.*?\)/gi, "").replace(/@done/gi, "").trim();
        li.innerHTML = `<div class="task-info" onclick="window.toggleByIndex(${item.originalIndex})"><span class="task-text">${cleanText}</span>${dateMatch ? `<span class="completion-date">Completed: ${dateMatch[1]}</span>` : ""}</div><button class="delete-btn" onclick="window.deleteByIndex(${item.originalIndex})">✕</button>`;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      listContainer.appendChild(section);
    });
  });
};

window.archiveCurrentProject = async () => {
    const docRef = doc(db, "plans", currentProject);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        await updateDoc(docRef, { archived: !snap.data().archived });
        await window.syncDropdown();
    }
};

window.deleteCurrentProject = async () => {
    const name = toTitleCase(currentProject);
    const confirmed = confirm(`Are you sure you want to delete "${name}"?`);
    if (confirmed) {
        const doubleCheck = confirm(`Last chance! Truly delete all data for "${name}"?`);
        if (doubleCheck) {
            await deleteDoc(doc(db, "plans", currentProject));
            await window.syncDropdown();
            window.loadProject(currentProject);
        }
    }
};

window.restartProject = async () => {
    if (!confirm("Copy this plan and reset all runs?")) return;
    try {
        const docSnap = await getDoc(doc(db, "plans", currentProject));
        if (!docSnap.exists()) return;
        const newRuns = (docSnap.data().runs || []).map(run => run.replace(/@done/gi, "").replace(/@date\(.*?\)/gi, "").trim());
        const newId = `${currentProject}-copy-${Date.now().toString().slice(-4)}`;
        await setDoc(doc(db, "plans", newId), { runs: newRuns, archived: false });
        await window.syncDropdown();
        window.loadProject(newId);
    } catch (e) { alert("Error restarting."); }
};

window.renameProject = async () => {
    const newName = prompt("New plan name:", toTitleCase(currentProject));
    if (!newName) return;
    try {
        const newId = newName.toLowerCase().replace(/\s+/g, '-');
        const oldRef = doc(db, "plans", currentProject);
        const docSnap = await getDoc(oldRef);
        if (docSnap.exists()) {
            await setDoc(doc(db, "plans", newId), docSnap.data());
            await deleteDoc(oldRef);
            await window.syncDropdown();
            window.loadProject(newId);
        }
    } catch (e) { alert("Error renaming."); }
};

window.toggleByIndex = async (index) => {
  const runs = [...localRuns];
  if (runs[index].includes("@done")) {
    runs[index] = runs[index].replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
  } else {
    const d = new Date();
    runs[index] = `${runs[index]} @done @date(${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })})`;
  }
  await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.deleteByIndex = async (index) => {
  const runs = [...localRuns];
  runs.splice(index, 1);
  await updateDoc(doc(db, "plans", currentProject), { runs });
};

window.handleProjectChange = async (val) => {
  if (val === "ADD_NEW") {
    const name = prompt("New plan name:");
    if (name) {
      const id = name.toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, "plans", id), { runs: [], archived: false });
      await window.syncDropdown();
      window.loadProject(id);
    } else { document.getElementById('projectSelect').value = currentProject; }
  } else { window.loadProject(val); }
};

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value.trim()) return;
  const updatedRuns = [...localRuns, input.value.trim()];
  input.value = "";
  await updateDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
};

(async () => { await window.syncDropdown(); window.loadProject(currentProject); })();
