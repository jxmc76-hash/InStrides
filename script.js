import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// A list of emojis to rotate through so every project has a unique favicon
const icons = ["🏃‍♂️", "⚡️", "👟", "🏔️", "🔥", "🏅", "💨", "🔋"];

const updateFavicon = (projectId) => {
    // Generate a unique index based on the name length
    const icon = icons[projectId.length % icons.length];
    const favicon = document.getElementById('favicon');
    favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${icon}</text></svg>`;
};

window.syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  const showArchived = document.getElementById('showArchived').checked;
  
  let optionsHtml = "";
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const isArchived = data.archived || false;
    
    // Only show archived if the checkbox is ticked
    if (showArchived || !isArchived) {
        const display = doc.id.replace(/-/g, ' ').toUpperCase();
        optionsHtml += `<option value="${doc.id}">${isArchived ? '📁 ' : '🏃‍♂️ '}${display}</option>`;
    }
  });
  
  select.innerHTML = optionsHtml + `<option value="ADD_NEW">+ Add New Plan...</option>`;
  select.value = currentProject;
};

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  updateFavicon(projectId);
  const docRef = doc(db, "plans", projectId);
  
  unsubscribe = onSnapshot(docRef, (doc) => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";
    if (!doc.exists()) return;
    
    localRuns = doc.data().runs || [];
    const isArchived = doc.data().archived || false;
    document.getElementById('archiveBtn').innerText = isArchived ? "Unarchive" : "Archive";

    const groups = {};
    localRuns.forEach((run, index) => {
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const label = weekMatch ? `WEEK ${weekMatch[1]}` : "CURRENT";
      if (!groups[label]) groups[label] = [];
      groups[label].push({ text: run, originalIndex: index });
    });

    Object.keys(groups).sort((a,b) => {
        if(a === "CURRENT") return -1;
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
        li.innerHTML = `<div class="task-info" onclick="window.toggleByIndex(${item.originalIndex})"><span class="task-text">${cleanText}</span>${dateMatch ? `<span class="completion-date">COMPLETED: ${dateMatch[1]}</span>` : ""}</div><button class="delete-btn" onclick="window.deleteByIndex(${item.originalIndex})">✕</button>`;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      listContainer.appendChild(section);
    });
  });
};

window.archiveCurrentProject = async () => {
    const docRef = doc(db, "plans", currentProject);
    const btn = document.getElementById('archiveBtn');
    const currentlyArchived = btn.innerText === "Unarchive";
    await updateDoc(docRef, { archived: !currentlyArchived });
    await window.syncDropdown();
    // If we archived it and "Show Archived" is off, switch to a default plan
    if (!currentlyArchived && !document.getElementById('showArchived').checked) {
        currentProject = "fast-5k";
        window.loadProject(currentProject);
    }
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
      currentProject = id;
      await window.syncDropdown();
      window.loadProject(id);
    }
  } else {
    currentProject = val;
    window.loadProject(val);
  }
};

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value.trim()) return;
  const updatedRuns = [...localRuns, input.value.trim()];
  input.value = "";
  await updateDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
};

(async () => {
  await window.syncDropdown();
  window.loadProject(currentProject);
})();
