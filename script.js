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

const syncDropdown = async () => {
  const querySnapshot = await getDocs(collection(db, "plans"));
  const select = document.getElementById('projectSelect');
  const addNewOpt = select.querySelector('option[value="ADD_NEW"]');
  select.innerHTML = "";
  querySnapshot.forEach((doc) => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.innerHTML = `🏃‍♂️ ${doc.id.replace(/-/g, ' ').toUpperCase()}`;
    select.appendChild(opt);
  });
  if (addNewOpt) select.appendChild(addNewOpt);
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
    localRuns.forEach((run, index) => {
      const weekMatch = run.match(/@w(?:eek)?\s?\(?(\d+)\)?/i);
      const label = weekMatch ? `WEEK ${weekMatch[1]}` : "CURRENT";
      if (!groups[label]) groups[label] = [];
      groups[label].push({ text: run, originalIndex: index });
    });

    Object.keys(groups).sort((a,b) => {
        if(a === "CURRENT") return -1;
        if(b === "CURRENT") return 1;
        return parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''));
    }).forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');

      groups[week].forEach((item) => {
        const li = document.createElement('li');
        if (item.text.includes("@done")) li.classList.add('done');
        
        const dateMatch = item.text.match(/@date\((.*?)\)/i);
        const completionDate = dateMatch ? dateMatch[1] : "";

        let cleanText = item.text
            .replace(/@w(?:eek)?\s?\(?(\d+)\)?/gi, "")
            .replace(/@date\(.*?\)/gi, "")
            .replace(/@done/gi, "")
            .trim();
        
        li.innerHTML = `
          <div class="task-info" onclick="window.toggleByIndex(${item.originalIndex})">
            <span class="task-text">${cleanText}</span>
            ${completionDate ? `<span class="completion-date">COMPLETED: ${completionDate}</span>` : ""}
          </div>
          <button class="delete-btn" onclick="window.deleteByIndex(${item.originalIndex})">✕</button>
        `;
        ul.appendChild(li);
      });
      section.appendChild(ul);
      listContainer.appendChild(section);
    });
  });
};

window.toggleByIndex = async (index) => {
  const runs = [...localRuns];
  let task = runs[index];
  if (task.includes("@done")) {
    runs[index] = task.replace("@done", "").replace(/@date\(.*?\)/gi, "").trim();
  } else {
    const d = new Date();
    const dateStr = d.getDate() + " " + d.toLocaleString('en-GB', { month: 'short' });
    runs[index] = `${task} @done @date(${dateStr})`;
  }
  await setDoc(doc(db, "plans", currentProject), { runs });
};

window.deleteByIndex = async (index) => {
  const runs = [...localRuns];
  runs.splice(index, 1);
  await setDoc(doc(db, "plans", currentProject), { runs });
};

window.handleProjectChange = async (val) => {
  if (val === "ADD_NEW") {
    const newName = prompt("Enter a name for your new training plan:");
    if (newName) {
      const newID = newName.toLowerCase().replace(/\s+/g, '-');
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

syncDropdown();
window.loadProject(currentProject);
