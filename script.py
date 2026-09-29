import os

path = 'lab_attendance_system/backend/static/script.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

tech_js = '''
// --- Custom Multi-Select for Technologies ---
const predefinedTechs = [
    "Python", "PyTorch", "TensorFlow", "Keras", "Scikit-Learn", "Pandas", "NumPy", "OpenCV", "YOLOv8", "YOLOv10",
    "ROS", "ROS2", "CUDA", "TensorRT", "LangChain", "LlamaIndex", "Ollama", "vLLM", "HuggingFace", "Transformers",
    "FastAPI", "Flask", "Django", "React", "Next.js", "Vue", "Angular", "Node.js", "Express", "TypeScript",
    "MongoDB", "PostgreSQL", "SQLite", "MySQL", "Redis", "Elasticsearch", "Qdrant", "ChromaDB", "Pinecone",
    "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Linux", "Bash", "Git", "GitHub Actions", "Jenkins",
    "Terraform", "Ansible", "WebRTC", "Socket.io", "Three.js", "WebGL", "C++", "C#", "Java", "Go", "Rust",
    "MATLAB", "Arduino", "Raspberry Pi", "NVIDIA Jetson", "ONNX"
];

let selectedTechs = new Set();

function initTechDropdown() {
    const container = document.getElementById("tech-options-container");
    if (!container) return;
    container.innerHTML = "";
    
    // Sort alphabetically
    predefinedTechs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(tech => {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "8px";
        label.style.padding = "6px";
        label.style.cursor = "pointer";
        label.style.borderRadius = "4px";
        label.className = "tech-option-label";
        
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = tech;
        cb.className = "tech-cb";
        cb.onclick = (e) => {
            e.stopPropagation();
            if (cb.checked) selectedTechs.add(tech);
            else selectedTechs.delete(tech);
            updateTechBadges();
        };
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(tech));
        container.appendChild(label);
        
        // Add hover effect via JS since inline styles are easy
        label.onmouseenter = () => label.style.background = "var(--surface-container-highest)";
        label.onmouseleave = () => label.style.background = "transparent";
    });
}

function toggleTechDropdown() {
    const list = document.getElementById("tech-dropdown-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
}

function filterTechDropdown() {
    const query = document.getElementById("tech-search").value.toLowerCase();
    const labels = document.querySelectorAll("#tech-options-container label");
    labels.forEach(label => {
        if (label.innerText.toLowerCase().includes(query)) {
            label.style.display = "flex";
        } else {
            label.style.display = "none";
        }
    });
}

function updateTechBadges() {
    const badgeContainer = document.getElementById("tech-selected-badges");
    const hiddenInput = document.getElementById("proj-technologies");
    
    if (selectedTechs.size === 0) {
        badgeContainer.innerHTML = "Select technologies...";
        hiddenInput.value = "";
        return;
    }
    
    badgeContainer.innerHTML = "";
    Array.from(selectedTechs).forEach(tech => {
        const badge = document.createElement("span");
        badge.style.background = "var(--primary-container)";
        badge.style.color = "var(--on-primary-container)";
        badge.style.padding = "2px 8px";
        badge.style.borderRadius = "12px";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "500";
        badge.innerText = tech;
        badgeContainer.appendChild(badge);
    });
    
    hiddenInput.value = Array.from(selectedTechs).join(", ");
}

function setTechSelection(techString) {
    selectedTechs.clear();
    if (techString && techString.trim()) {
        techString.split(",").map(s => s.trim()).forEach(t => {
            if (t) selectedTechs.add(t);
        });
    }
    
    // Update checkboxes
    document.querySelectorAll(".tech-cb").forEach(cb => {
        cb.checked = selectedTechs.has(cb.value);
    });
    
    updateTechBadges();
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
    const multiSelect = document.getElementById("tech-multi-select");
    const list = document.getElementById("tech-dropdown-list");
    if (multiSelect && list && !multiSelect.contains(e.target)) {
        list.style.display = "none";
    }
});

document.addEventListener("DOMContentLoaded", () => {
    initTechDropdown();
});
'''

if 'function initTechDropdown' not in content:
    content += "\n" + tech_js

# Ensure edit project modal sets the tech selection properly
# Let's find openBackendProjectModal to replace proj-technologies.value with setTechSelection
if 'document.getElementById("proj-technologies").value = tech;' in content:
    content = content.replace('document.getElementById("proj-technologies").value = tech;', 'setTechSelection(tech);')
else:
    # generic fix: if not found, we will manually replace in edit modal
    pass

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done adding tech JS")
