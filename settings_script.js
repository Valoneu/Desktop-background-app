// Renderer process (settings_script.js) - Settings Window Logic

let currentSettings = {};
let modifiedDisks = []; // Work with a copy of the disks array

// DOM Elements
const diskListElement = document.getElementById('disk-list');
const newDiskInput = document.getElementById('new-disk-path');
const addDiskButton = document.getElementById('add-disk-button');
const addDiskBrowseButton = document.getElementById('add-disk-browse-button');
const saveButton = document.getElementById('save-settings-button');
const cancelButton = document.getElementById('cancel-settings-button');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        currentSettings = await window.settingsAPI.getSettings();
        // *Ensure trackedDisks is an array, default to empty if not found/invalid*
        modifiedDisks = Array.isArray(currentSettings.trackedDisks) ? [...currentSettings.trackedDisks] : [];
        renderDiskList();
    } catch (error) {
        console.error("Error loading settings:", error);
        diskListElement.innerHTML = '<li>Error loading settings.</li>';
    }
    setupEventListeners();
});

// Render the list of disks
function renderDiskList() {
    diskListElement.innerHTML = ''; // Clear current list
    if (modifiedDisks.length === 0) {
         diskListElement.innerHTML = '<li>No disks being tracked.</li>';
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

    // Add event listeners AFTER creating the buttons
    diskListElement.querySelectorAll('.remove-disk-btn').forEach(button => {
        button.addEventListener('click', handleRemoveDisk);
    });
}

// Handle removing a disk
function handleRemoveDisk(event) {
    const indexToRemove = parseInt(event.target.dataset.index, 10);
    if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < modifiedDisks.length) {
        modifiedDisks.splice(indexToRemove, 1);
        renderDiskList(); // Re-render the list to reflect removal
    }
}

// Handle adding a disk (from manual input or browse)
function handleAddDisk(diskPath) {
     const newPath = diskPath.trim();
     // Basic validation: Check if empty or already exists
     if (!newPath) {
         alert("Please enter or select a disk path.");
         return;
     }
      if (modifiedDisks.includes(newPath)) {
         alert(`Disk "${newPath}" is already in the list.`);
         return;
     }
     // Add the new path and re-render
     modifiedDisks.push(newPath);
     renderDiskList();
     newDiskInput.value = ''; // Clear input after adding manually
     newDiskInput.focus(); // Set focus back to input
}

// Setup all event listeners
function setupEventListeners() {
    // Add disk manually button
    addDiskButton.addEventListener('click', () => {
        handleAddDisk(newDiskInput.value);
    });

    // Browse for disk button
    addDiskBrowseButton.addEventListener('click', async () => {
        try {
            // Use the 'selectPath' exposed via preload, asking for a directory
            const selectedPath = await window.settingsAPI.selectPath('folder');
            if (selectedPath) {
               // Try to simplify the path for common cases
               let pathToAdd = selectedPath;

               // Windows: Extract drive letter (e.g., C:)
               if (/^[a-zA-Z]:\\/.test(selectedPath)) { // Matches C:\, D:\folder etc.
                   pathToAdd = selectedPath.substring(0, 2);
               }
               // Linux/macOS: Use the selected path directly (might be /, /home, /Volumes/etc)

               handleAddDisk(pathToAdd);
            }
        } catch (error) {
            console.error("Error selecting folder:", error);
            alert("Could not browse for folder. Please enter the path manually.");
        }
    });

    // Allow adding disk by pressing Enter in the input field
    newDiskInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent potential form submission if wrapped in form
            handleAddDisk(newDiskInput.value);
        }
    });

    // Save button
    saveButton.addEventListener('click', async () => {
        try {
            // Create the updated settings object
            const updatedSettings = {
                ...currentSettings, // Keep other existing settings (like shortcuts)
                trackedDisks: modifiedDisks // Update the disks array
            };
            await window.settingsAPI.saveSettings(updatedSettings);
            // Main process handles notifying the main window
            window.settingsAPI.closeWindow(); // Close settings window after saving
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Failed to save settings. Check console for details.");
        }
    });

    // Cancel button
    cancelButton.addEventListener('click', () => {
        window.settingsAPI.closeWindow(); // Close without saving
    });
}