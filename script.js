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
  const addNewOpt = select.options[select.options.length - 1];
  select.innerHTML = "";
  querySnapshot.forEach((doc) => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.innerHTML = `🏃‍♂️ ${doc.id.replace(/-/g, ' ').toUpperCase()}`;
    select.appendChild(opt);
  });
  select.appendChild(addNewOpt);
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

    Object.keys(groups).sort((a,b) => {
        if(a === "CURRENT") return -1;
        return parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''));
    }).forEach(week => {
      const section = document.createElement('div');
      section.innerHTML = `<div class="week-heading"><h3>${week}</h3></div>`;
      const ul = document.createElement('ul');

      groups[week].forEach((task, index) => {
        const li = document.createElement('li');
        const isDone = task.includes("@done");
        if (isDone) li.className = "done";
        
        const dateMatch = task.match(/@date\((.*?)\)/);
        const completionDate = dateMatch ? dateMatch[1] : "";

        let cleanText = task.replace(/@w(?:eek)?\s?\(?(\d+)\)?/i, "")
                            .replace(/@date\(.*?\)/, "")
                            .replace("@done", "").trim();
        
        li.innerHTML = `
          <div class="task-info" onclick="window.toggleByIndex(${localRuns.indexOf(task)})">
            <span class="task-text">${cleanText}</span>
            ${completionDate ? `<span class="completion-date">Completed: ${completionDate}</span>` : ""}
          </div>
          <button class="delete-btn" onclick="window.deleteByIndex(${localRuns.indexOf(task)})">✕</button>
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
    runs[index] = task.replace(" @done", "").replace(/ @date\(.*?\)/, "");
  } else {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    runs[index] = `${task} @done @date(${today})`;
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
