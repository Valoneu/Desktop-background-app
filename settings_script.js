let currentSettings = {};
let modifiedDisks = [];

const diskListElement = document.getElementById('disk-list');
const newDiskInput = document.getElementById('new-disk-path');
const addDiskButton = document.getElementById('add-disk-button');
const addDiskBrowseButton = document.getElementById('add-disk-browse-button');
const saveButton = document.getElementById('save-settings-button');
const cancelButton = document.getElementById('cancel-settings-button');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        currentSettings = await window.settingsAPI.getSettings();
        modifiedDisks = Array.isArray(currentSettings.trackedDisks) ? [...currentSettings.trackedDisks] : [];
        renderDiskList();
    } catch (error) {
        console.error("Error loading settings:", error);
        diskListElement.innerHTML = '<li class="error-placeholder">Error loading settings.</li>';
    }
    setupEventListeners();
});

function renderDiskList() {
    diskListElement.innerHTML = '';
    if (modifiedDisks.length === 0) {
         diskListElement.innerHTML = '<li class="info-placeholder">No disks being tracked. Add one below.</li>';
    } else {
        modifiedDisks.forEach((diskPath, index) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>${diskPath}</span>
                <button class="remove-disk-btn" data-index="${index}" title="Remove ${diskPath}">Remove</button>
            `;
            diskListElement.appendChild(listItem);
        });
    }

    diskListElement.querySelectorAll('.remove-disk-btn').forEach(button => {
        button.removeEventListener('click', handleRemoveDisk); // Remove old listener first
        button.addEventListener('click', handleRemoveDisk);
    });
}

function handleRemoveDisk(event) {
    const indexToRemove = parseInt(event.target.dataset.index, 10);
    if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < modifiedDisks.length) {
        modifiedDisks.splice(indexToRemove, 1);
        renderDiskList();
    }
}

function handleAddDisk(diskPath) {
    const newPath = diskPath.trim();
    if (!newPath) {
        alert("Please enter or select a disk path.");
        return;
    }
    if (modifiedDisks.some(p => p.toUpperCase() === newPath.toUpperCase())) { // Case-insensitive check
        alert(`"${newPath}" is already in the list.`);
        return;
    }
    modifiedDisks.push(newPath);
    renderDiskList();
    newDiskInput.value = '';
    newDiskInput.focus();
}

function setupEventListeners() {
    addDiskButton.addEventListener('click', () => {
        handleAddDisk(newDiskInput.value);
    });

    addDiskBrowseButton.addEventListener('click', async () => {
        try {
            const selectedPath = await window.settingsAPI.selectPath('folder');
            if (selectedPath) {
                let pathToAdd = selectedPath;
                // Attempt to get root drive on Windows (e.g., C:)
                if (/^[a-zA-Z]:\\/.test(selectedPath)) {
                     // Use regex to extract drive letter + colon
                     const match = selectedPath.match(/^([a-zA-Z]:)/);
                     if (match && match[1]) {
                         pathToAdd = match[1];
                     }
                }
                // On Unix-like systems, usually you want the selected mount point itself,
                // or just '/' if they select something deep inside the root filesystem.
                // For simplicity, we'll add the selected path directly if it's not a Windows drive.
                handleAddDisk(pathToAdd);
            }
        } catch (error) {
            console.error("Error selecting folder:", error);
            alert("Could not browse for folder. Please enter the path manually.");
        }
    });

    newDiskInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleAddDisk(newDiskInput.value);
        }
    });

    saveButton.addEventListener('click', async () => {
        try {
            const updatedSettings = { ...currentSettings, trackedDisks: modifiedDisks };
            await window.settingsAPI.saveSettings(updatedSettings);
            window.settingsAPI.closeWindow();
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Failed to save settings. Check console for details.");
        }
    });

    cancelButton.addEventListener('click', () => {
        window.settingsAPI.closeWindow();
    });
}