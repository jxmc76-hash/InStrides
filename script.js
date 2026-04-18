import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// NEW: This function automatically populates your dropdown from Firebase
const syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  
  // Clear existing options except the "Add New" one
  const addNewOpt = select.options[select.options.length - 1];
  select.innerHTML = "";
  
  querySnapshot.forEach((doc) => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.innerHTML = `🏃‍♂️ ${doc.id.replace(/-/g, ' ').toUpperCase()}`;
    select.appendChild(opt);
  });
  
  select.appendChild(addNewOpt); // Put "Add New" back at the bottom
  select.value = currentProject;
};

window.loadProject = (projectId) => {
  if (unsubscribe) unsubscribe();
  const docRef = doc(db, "plans", projectId);
  
  unsubscribe = onSnapshot(docRef, (doc) => {
    const listContainer = document.getElementById('runList');
    listContainer.innerHTML = "";
    localRuns = doc.exists() ? doc.data().runs : [];

    const groups = {};
    localRuns.forEach(run => {
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const label = weekMatch ? `WEEK ${weekMatch[1]}` : "CURRENT";
      if (!groups[label]) groups[label] = [];
      groups[label].push(run);
    });

    Object.keys(groups).sort().forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');
      groups[week].forEach(task => {
        const li = document.createElement('li');
        if (task.includes("@done")) li.className = "done";
        const cleanText = task.replace(/@w(?:eek)?\s?\(?(\d+)\)?/i, "").replace("@done", "").trim();
        li.innerHTML = `
          <span class="task-text" onclick="window.toggleByText('${task.replace(/'/g, "\\'")}')">${cleanText}</span>
          <button class="delete-btn" onclick="window.deleteByText('${task.replace(/'/g, "\\'")}')">✕</button>
        `;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      listContainer.appendChild(section);
    });
  });
};

window.handleProjectChange = async (val) => {
  if (val === "ADD_NEW") {
    const newName = prompt("Enter a name for your new training plan:");
    if (newName) {
      const newID = newName.toLowerCase().replace(/\s+/g, '-');
      // Create it in Firebase first so syncDropdown finds it
      await setDoc(doc(db, "plans", newID), { runs: [] });
      currentProject = newID;
      await syncDropdown();
      window.loadProject(newID);
    } else {
      document.getElementById('projectSelect').value = currentProject;
    }
  } else {
    currentProject = val;
    window.loadProject(val);
  }
};

window.addRun = async () => {
  const input = document.getElementById('runInput');
  if (!input.value) return;
  const updatedRuns = [...localRuns, input.value];
  await setDoc(doc(db, "plans", currentProject), { runs: updatedRuns });
  input.value = "";
};

window.toggleByText = async (originalText) => {
  const runs = localRuns.map(r => r === originalText ? (r.includes("@done") ? r.replace(" @done", "") : r + " @done") : r);
  await setDoc(doc(db, "plans", currentProject), { runs });
};

window.deleteByText = async (originalText) => {
  const runs = localRuns.filter(r => r !== originalText);
  await setDoc(doc(db, "plans", currentProject), { runs });
};

// Initial Load
syncDropdown();
window.loadProject(currentProject);
