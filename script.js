// Renderer process (script.js) - Main Window Logic

// --- State ---
let currentSettings = {
	shortcuts: [],
	trackedDisks: []
};
let trackedDisks = []; // Keep a separate copy focused on disks for updates

// --- DOM Elements ---
const timeElements = {
	hours: document.getElementById('hours'),
	minutes: document.getElementById('minutes'),
	seconds: document.getElementById('seconds'),
	year: document.getElementById('year'),
	month: document.getElementById('month'),
};
const calendarBody = document.getElementById('calendar-body');
const statElements = {
	cpuValue: document.getElementById('cpu-value'),
	cpuProgress: document.getElementById('cpu-progress'),
	ramValue: document.getElementById('ram-value'),
	ramProgress: document.getElementById('ram-progress'),
	gpuValue: document.getElementById('gpu-value'),
	gpuProgress: document.getElementById('gpu-progress'),
	vramValue: document.getElementById('vram-value'),
	vramProgress: document.getElementById('vram-progress'),
	downloadValue: document.getElementById('download-value'),
	uploadValue: document.getElementById('upload-value'),
};
const diskUsageContainer = document.getElementById('disk-usage-bars');
const notesTextarea = document.getElementById('notes-textarea'); // *Using textarea now*
const folderShortcutsList = document.getElementById('folder-shortcuts');
const appShortcutsList = document.getElementById('app-shortcuts');
const settingsButton = document.getElementById('settings-button');
const addShortcutButtons = document.querySelectorAll('.add-shortcut-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
	setupEventListeners();
	updateTime(); // Initial time update
	setInterval(updateTime, 1000);
	renderCalendar(new Date());
	await loadInitialData(); // Load settings first
	createDiskUI(); // Create UI based on loaded settings
	startDiskUpdates(); // Start disk updates
	loadAndDisplayNotes(); // Load notes into textarea

	// Start listening for system info updates pushed from main process
	window.electronAPI.onSystemInfoUpdate(updateSystemInfoUI);
});

// --- Event Listeners ---
function setupEventListeners() {
	// *Save notes when the textarea loses focus*
	notesTextarea.addEventListener('blur', handleNotesSave);

	// *Settings button now opens the settings window*
	settingsButton.addEventListener('click', () => {
			console.log('Settings button clicked, opening window...'); // *Debug*
			window.electronAPI.openSettingsWindow();
	});

	// *Listen for settings updates from the main process (triggered by settings window save)*
	window.electronAPI.onSettingsUpdated((updatedSettings) => {
			console.log('Received settings update in main window:', updatedSettings);
			currentSettings = updatedSettings; // *Update local settings copy*
			trackedDisks = currentSettings.trackedDisks || []; // *Update tracked disks array*
			// *Re-render or update parts of the UI that depend on settings*
			createDiskUI(); // *Recreate disk UI elements based on new list*
			updateDiskUsage(); // *Trigger immediate update of disk usage data*
			renderShortcuts(); // *Re-render shortcuts as well*
	});

	addShortcutButtons.forEach(button => {
			button.addEventListener('click', handleAddShortcut);
	});

	// Use event delegation for removing/clicking shortcuts
	folderShortcutsList.addEventListener('click', handleShortcutListClick);
	appShortcutsList.addEventListener('click', handleShortcutListClick);
}

// --- Initial Data Loading ---
async function loadInitialData() {
	try {
			currentSettings = await window.electronAPI.getSettings();
			// Ensure trackedDisks is always an array
			trackedDisks = Array.isArray(currentSettings.trackedDisks) ? currentSettings.trackedDisks : [];
			// Ensure shortcuts is always an array
			currentSettings.shortcuts = Array.isArray(currentSettings.shortcuts) ? currentSettings.shortcuts : [];

			renderShortcuts();
			// createDiskUI() is called after this in DOMContentLoaded
	} catch (error) {
			console.error("Error loading initial settings:", error);
			// Fallback to empty arrays if loading fails
			currentSettings = { shortcuts: [], trackedDisks: [] };
			trackedDisks = [];
	}
}


// --- Time & Date ---
function updateTime() {
	const date = new Date();
	timeElements.hours.textContent = date.getHours().toString().padStart(2, '0');
	timeElements.minutes.textContent = date.getMinutes().toString().padStart(2, '0');
	timeElements.seconds.textContent = date.getSeconds().toString().padStart(2, '0');
	timeElements.year.textContent = date.getFullYear();
	timeElements.month.textContent = date.toLocaleString('default', { month: 'long' });
}

// --- Calendar ---
function renderCalendar(date) {
	calendarBody.innerHTML = '';
	const year = date.getFullYear();
	const month = date.getMonth();
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Normalize today's date

	const firstDayOfMonth = new Date(year, month, 1);
	const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
	const firstDayWeekday = firstDayOfMonth.getDay(); // 0 = Sunday, 6 = Saturday

	let currentDate = new Date(firstDayOfMonth);
	currentDate.setDate(currentDate.getDate() - firstDayWeekday); // Start date of the first row

	for (let i = 0; i < 6; i++) { // Max 6 rows
			const row = document.createElement('tr');
			let rowHasCurrentMonthDay = false;

			for (let j = 0; j < 7; j++) {
					const cell = document.createElement('td');
					const cellDate = new Date(currentDate);
					cellDate.setHours(0, 0, 0, 0);

					cell.textContent = cellDate.getDate();

					if (cellDate.getMonth() === month) {
							 rowHasCurrentMonthDay = true;
							if (cellDate.getTime() === today.getTime()) {
									cell.classList.add('today');
							}
					} else {
							cell.classList.add('other-month');
					}
					row.appendChild(cell);
					currentDate.setDate(currentDate.getDate() + 1);
			}
			// Only add row if it's needed (contains days of current month or first row)
			if (rowHasCurrentMonthDay || i === 0 && currentDate.getMonth() === month) {
				 calendarBody.appendChild(row);
			}
			// Optimization: Stop if the next day to render is already in the next month *after* the current month
			 if (currentDate.getMonth() !== month && currentDate.getDate() > 1 && rowHasCurrentMonthDay) {
				 break;
			}

	}
}


// --- System Info ---
function updateSystemInfoUI(info) {
	updateStat(statElements.cpuValue, statElements.cpuProgress, info.cpu, '%');
	updateStat(statElements.ramValue, statElements.ramProgress, info.ram, '%');
	updateStat(statElements.gpuValue, statElements.gpuProgress, info.gpu, '%');
	updateStat(statElements.vramValue, statElements.vramProgress, info.vram, '%');
	updateStat(statElements.downloadValue, null, info.down, ' Mbps');
	updateStat(statElements.uploadValue, null, info.up, ' Mbps');
}

function updateStat(valueElement, progressElement, value, unit = '') {
	const displayValue = (value !== null && value !== undefined) ? `${value}${unit}` : `N/A`;
	if (valueElement) {
			valueElement.textContent = displayValue;
	}
	if (progressElement) {
			const percentage = (value !== null && value !== undefined) ? Math.max(0, Math.min(100, parseFloat(value))) : 0;
			progressElement.style.width = `${percentage}%`;
			// Reset classes first
			progressElement.classList.remove('high-usage', 'critical-usage');
			if (percentage > 90) {
					progressElement.classList.add('critical-usage');
			} else if (percentage > 70) {
					progressElement.classList.add('high-usage');
			}
	}
}

// --- Disk Usage ---
let diskUpdateInterval;

function createDiskUI() {
	diskUsageContainer.innerHTML = ''; // Clear previous elements
	console.log('Creating Disk UI for:', trackedDisks); // Debug
	if (!Array.isArray(trackedDisks)) {
			console.error("trackedDisks is not an array!", trackedDisks);
			trackedDisks = []; // Reset to empty array to prevent errors
	}
	trackedDisks.forEach(diskPath => {
			// Ensure diskPath is a string before creating ID
			if (typeof diskPath !== 'string') {
					console.warn(`Skipping non-string disk path:`, diskPath);
					return;
			}
			const diskId = `disk-${diskPath.replace(/[^a-zA-Z0-9]/g, '-')}`; // Create a safe ID
			const diskItem = document.createElement('div');
			diskItem.className = 'disk-item';
			diskItem.id = diskId;
			diskItem.innerHTML = `
					<div class="disk-label" title="${diskPath}">${diskPath}</div>
					<div class="disk-percentage">--%</div>
					<div class="disk-progress-container">
							<div class="disk-progress-bar"></div>
					</div>
					<div class="disk-details">-- GB / -- GB</div>
			`;
			diskUsageContainer.appendChild(diskItem);
	});
}

async function updateDiskUsage() {
	if (!Array.isArray(trackedDisks)) {
			console.error("Cannot update disk usage, trackedDisks is not an array.");
			return; // Prevent errors
	}
	//console.log("Updating disk usage for:", trackedDisks);
	for (const diskPath of trackedDisks) {
			if (typeof diskPath !== 'string') continue; // Skip if not a string

			const diskId = `disk-${diskPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
			const diskElement = document.getElementById(diskId);
			if (!diskElement) {
					//console.warn(`Disk element not found for path: ${diskPath} (ID: ${diskId})`);
					continue; // Skip if element doesn't exist (might happen during rapid updates)
			}

			const percentageEl = diskElement.querySelector('.disk-percentage');
			const detailsEl = diskElement.querySelector('.disk-details');
			const progressBar = diskElement.querySelector('.disk-progress-bar');
			const labelEl = diskElement.querySelector('.disk-label');

			try {
					const usage = await window.electronAPI.checkDiskUsage(diskPath);
					percentageEl.textContent = `${usage.usedPercentage}%`;
					detailsEl.textContent = `${usage.freeGB} GB free / ${usage.totalGB} GB`;
					const percentage = parseFloat(usage.usedPercentage);
					progressBar.style.width = `${percentage}%`;
					labelEl.title = diskPath; // Reset title on success

					// Update progress bar color based on usage
					progressBar.classList.remove('high-usage', 'critical-usage');
					if (percentage > 90) {
							progressBar.classList.add('critical-usage');
					} else if (percentage > 75) {
							progressBar.classList.add('high-usage');
					}

			} catch (error) {
					console.error(`Error updating disk ${diskPath}:`, error);
					percentageEl.textContent = `Error`;
					detailsEl.textContent = `---`;
					progressBar.style.width = '0%';
					progressBar.classList.remove('high-usage'); // Clear normal status classes
					progressBar.classList.add('critical-usage'); // Indicate error state visually
					labelEl.title = `${diskPath}\nError: ${error.message}`; // Show error on hover
			}
	}
}

function startDiskUpdates() {
	if (diskUpdateInterval) clearInterval(diskUpdateInterval); // Clear existing interval
	updateDiskUsage(); // Initial update
	diskUpdateInterval = setInterval(updateDiskUsage, 60000); // Update every 60 seconds
}

// --- Notes --- (*Modified for inline editing*)
async function handleNotesSave() {
	const currentNotes = notesTextarea.value;
	console.log('Notes textarea blurred, attempting to save...');
	try {
			await window.electronAPI.saveNotes(currentNotes);
			console.log('Notes saved successfully via blur.');
	} catch (error) {
			console.error('Failed to save notes from renderer:', error);
			// Show an error message to the user? e.g., temporarily change border color
	}
}

async function loadAndDisplayNotes() {
	console.log("Loading notes into textarea...");
	try {
			const notesContent = await window.electronAPI.loadNotes(); // Should return string
			notesTextarea.value = notesContent || ''; // Set textarea value
			// Placeholder is handled by the textarea attribute now
	} catch (error) {
			console.error('Failed to load notes:', error);
			notesTextarea.value = 'Error loading notes.'; // Show error in textarea
	}
}

// --- Shortcuts ---
function renderShortcuts() {
	folderShortcutsList.innerHTML = '';
	appShortcutsList.innerHTML = '';

	if (!currentSettings || !Array.isArray(currentSettings.shortcuts)) {
			console.warn("Settings or shortcuts array not found or invalid.");
			return;
	}

	currentSettings.shortcuts.forEach((shortcut, index) => {
			// Basic validation of shortcut object
			if (!shortcut || typeof shortcut.path !== 'string' || typeof shortcut.name !== 'string' || typeof shortcut.type !== 'string') {
					console.warn(`Invalid shortcut object at index ${index}:`, shortcut);
					return; // Skip this invalid shortcut
			}

			const listItem = document.createElement('li');
			listItem.className = 'shortcut-item';
			listItem.dataset.index = index; // Store index for removal
			listItem.dataset.path = shortcut.path; // Store path for opening
			listItem.title = shortcut.path; // Show full path on hover

			const iconClass = shortcut.type === 'folder' ? 'fa-regular fa-folder' : 'fa-solid fa-rocket'; // Example icons

			listItem.innerHTML = `
					<span class="shortcut-icon"><i class="${iconClass}"></i></span>
					<span class="shortcut-name">${shortcut.name}</span>
					<button class="remove-shortcut-btn" title="Remove Shortcut"><i class="fas fa-times"></i></button>
			`;

			if (shortcut.type === 'folder') {
					folderShortcutsList.appendChild(listItem);
			} else { // Assume 'app' or any other type goes here
					appShortcutsList.appendChild(listItem);
			}
	});
}


async function handleAddShortcut(event) {
	const button = event.currentTarget;
	const type = button.dataset.type; // 'folder' or 'app'

	try {
			const selectedPath = await window.electronAPI.selectPath(type);
			if (selectedPath) {
					// Basic name generation (user might want to customize this later)
					const name = selectedPath.split(/\/|\\/).pop() || selectedPath; // Get last part of the path

					const newShortcut = { name, path: selectedPath, type };

					// Ensure shortcuts array exists before pushing
					 if (!Array.isArray(currentSettings.shortcuts)) {
							currentSettings.shortcuts = [];
					 }

					currentSettings.shortcuts.push(newShortcut);
					await saveAndRerenderShortcuts();
			}
	} catch (error) {
			console.error(`Error selecting ${type}:`, error);
			alert(`Could not select ${type}. See console for details.`);
	}
}

function handleShortcutListClick(event) {
	const target = event.target;
	const removeButton = target.closest('.remove-shortcut-btn');
	const shortcutItem = target.closest('.shortcut-item');

	if (removeButton && shortcutItem) {
			// Stop the event from propagating to the item itself (prevents opening)
			event.stopPropagation();
			// Remove shortcut
			const indexToRemove = parseInt(shortcutItem.dataset.index, 10);
			 if (!isNaN(indexToRemove) && Array.isArray(currentSettings.shortcuts) && indexToRemove >= 0 && indexToRemove < currentSettings.shortcuts.length) {
					 currentSettings.shortcuts.splice(indexToRemove, 1);
					 saveAndRerenderShortcuts();
			} else {
					console.error("Could not remove shortcut, invalid index or shortcuts array:", indexToRemove, currentSettings.shortcuts);
			}
	} else if (shortcutItem) {
			// Open shortcut
			const pathToOpen = shortcutItem.dataset.path;
			if (pathToOpen) {
					window.electronAPI.openShortcut(pathToOpen);
			}
	}
}

async function saveAndRerenderShortcuts() {
	 try {
			// Only save the shortcuts part of the settings
			await window.electronAPI.saveSettings({ shortcuts: currentSettings.shortcuts });
			renderShortcuts(); // Re-render the list
	} catch (error) {
			console.error("Error saving settings after shortcut change:", error);
			alert("Could not save shortcut changes. See console for details.");
	}
}

// Optional: Clean up IPC listeners when the window is about to unload
window.addEventListener('beforeunload', () => {
	window.electronAPI.removeSystemInfoListener();
	window.electronAPI.removeSettingsUpdatedListener(); // Clean up settings listener too
	if (diskUpdateInterval) clearInterval(diskUpdateInterval);
});