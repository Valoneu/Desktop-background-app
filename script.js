const Chart = window.Chart;

let currentSettings = { shortcuts: [], trackedDisks: [] };
let trackedDisks = [];
const chartInstances = {};
const chartDataHistory = { cpu: [], ram: [], gpu: [], vram: [], down: [], up: [] };
const MAX_HISTORY = 60;
const CHART_LABELS = Array(MAX_HISTORY).fill('');
let diskUpdateInterval;

const timeElements = {
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    seconds: document.getElementById('seconds'),
    year: document.getElementById('year'),
    dayOfWeek: document.getElementById('day-of-week'),
    monthDay: document.getElementById('month-day')
};
const calendarBody = document.getElementById('calendar-body');
const statElements = {
    cpuValue: document.getElementById('cpu-value'),
    cpuProgress: document.getElementById('cpu-progress'),
    cpuChartCanvas: document.getElementById('cpu-chart'),
    ramValue: document.getElementById('ram-value'),
    ramProgress: document.getElementById('ram-progress'),
    ramChartCanvas: document.getElementById('ram-chart'),
    gpuValue: document.getElementById('gpu-value'),
    gpuProgress: document.getElementById('gpu-progress'),
    gpuChartCanvas: document.getElementById('gpu-chart'),
    vramValue: document.getElementById('vram-value'),
    vramProgress: document.getElementById('vram-progress'),
    vramChartCanvas: document.getElementById('vram-chart'),
    downloadValue: document.getElementById('download-value'),
    downChartCanvas: document.getElementById('down-chart'),
    uploadValue: document.getElementById('upload-value'),
    upChartCanvas: document.getElementById('up-chart'),
};
const diskUsageContainer = document.getElementById('disk-usage-bars');
const notesTextarea = document.getElementById('notes-textarea');
const shortcutList = document.getElementById('shortcut-list');
const settingsButton = document.getElementById('settings-button');
const addShortcutButtons = document.querySelectorAll('.add-shortcut-btn');

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    updateTime();
    setInterval(updateTime, 1000);
    renderCalendar(new Date());

    try {
        await loadInitialData();
        createDiskUI();
        startDiskUpdates();
        await loadAndDisplayNotes();
        initializeCharts();
        window.electronAPI.onSystemInfoUpdate(updateSystemInfoUI);
    } catch (error) {
        console.error("Error during initialization:", error);
    }
});

function setupEventListeners() {
    notesTextarea.addEventListener('blur', handleNotesSave);
    settingsButton.addEventListener('click', () => window.electronAPI.openSettingsWindow());
    window.electronAPI.onSettingsUpdated((updatedSettings) => {
        currentSettings = updatedSettings;
        trackedDisks = Array.isArray(currentSettings.trackedDisks) ? currentSettings.trackedDisks : [];
        currentSettings.shortcuts = Array.isArray(currentSettings.shortcuts) ? currentSettings.shortcuts : [];
        createDiskUI();
        updateDiskUsage();
        renderShortcuts();
    });
    addShortcutButtons.forEach(button => button.addEventListener('click', handleAddShortcut));
    shortcutList.addEventListener('click', handleShortcutListClick);
}

async function loadInitialData() {
    try {
        currentSettings = await window.electronAPI.getSettings();
        trackedDisks = Array.isArray(currentSettings.trackedDisks) ? currentSettings.trackedDisks : [];
        currentSettings.shortcuts = Array.isArray(currentSettings.shortcuts) ? currentSettings.shortcuts : [];
        renderShortcuts();
    } catch (error) {
        console.error("Error loading initial settings:", error);
        currentSettings = { shortcuts: [], trackedDisks: [] };
        trackedDisks = [];
        renderShortcuts();
    }
}

function updateTime() {
    try {
        const date = new Date();
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        timeElements.hours.textContent = date.getHours().toString().padStart(2, '0');
        timeElements.minutes.textContent = date.getMinutes().toString().padStart(2, '0');
        timeElements.seconds.textContent = date.getSeconds().toString().padStart(2, '0');
        timeElements.dayOfWeek.textContent = dayNames[date.getDay()];
        timeElements.monthDay.textContent = `${monthNames[date.getMonth()]} ${date.getDate()}`;
        timeElements.year.textContent = date.getFullYear();
    } catch (e) {
        console.error("Error updating time:", e);
    }
}

function renderCalendar(date) {
    try {
        calendarBody.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const firstDayOfMonth = new Date(year, month, 1);
        const firstDayWeekday = firstDayOfMonth.getDay();

        let currentDate = new Date(firstDayOfMonth);
        currentDate.setDate(currentDate.getDate() - firstDayWeekday);

        for (let i = 0; i < 6; i++) {
            const row = document.createElement('tr');
            let rowHasCurrentMonthDay = false;

            for (let j = 0; j < 7; j++) {
                const cell = document.createElement('td');
                const cellDate = new Date(currentDate);
                cellDate.setHours(0, 0, 0, 0);

                const daySpan = document.createElement('span');
                daySpan.textContent = cellDate.getDate();
                cell.appendChild(daySpan);

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
            if (rowHasCurrentMonthDay || i === 0) {
                 calendarBody.appendChild(row);
            }
            if (currentDate.getMonth() !== month && currentDate.getDate() > 1 && rowHasCurrentMonthDay) {
                break;
            }
        }
    } catch(e) {
        console.error("Error rendering calendar:", e);
    }
}

function updateSystemInfoUI(info) {
    try {
        updateStat(statElements.cpuValue, statElements.cpuProgress, info.cpu, '%');
        updateStat(statElements.ramValue, statElements.ramProgress, info.ram, '%');
        updateStat(statElements.gpuValue, statElements.gpuProgress, info.gpu, '%');
        updateStat(statElements.vramValue, statElements.vramProgress, info.vram, '%');
        updateStat(statElements.downloadValue, null, info.down, ' Mbps');
        updateStat(statElements.uploadValue, null, info.up, ' Mbps');

        updateHistory('cpu', info.cpu);
        updateHistory('ram', info.ram);
        updateHistory('gpu', info.gpu);
        updateHistory('vram', info.vram);
        updateHistory('down', info.down);
        updateHistory('up', info.up);

        updateChart('cpu');
        updateChart('ram');
        updateChart('gpu');
        updateChart('vram');
        updateChart('down');
        updateChart('up');
    } catch (e) {
        console.error("Error updating system info UI:", e);
    }
}

function updateHistory(key, value) {
    try {
        const history = chartDataHistory[key];
        const numericValue = (value === null || value === undefined || isNaN(parseFloat(value))) ? null : parseFloat(value);
        history.push(numericValue);
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
    } catch (e) {
        console.error(`Error updating history for ${key}:`, e);
    }
}


function updateChart(key) {
    try {
        const chart = chartInstances[key];
        if (chart && chart.data && chart.data.datasets && chart.data.datasets[0]) {
            const dataArray = [...chartDataHistory[key]];
            while (dataArray.length < MAX_HISTORY) {
                dataArray.unshift(null);
            }
            chart.data.datasets[0].data = dataArray;

            if (key === 'down' || key === 'up') {
                const numericHistory = chartDataHistory[key].filter(v => typeof v === 'number');
                const currentMax = numericHistory.length > 0 ? Math.max(...numericHistory) : 0;
                const newMax = Math.max(10, Math.ceil(currentMax * 1.1));

                chart.options.scales.y.max = newMax;
            }

            chart.update('none');
        }
    } catch (e) {
        console.error(`Error updating chart for ${key}:`, e);
    }
}


function updateStat(valueElement, progressElement, value, unit = '') {
    try {
        const displayValue = (value !== null && value !== undefined) ? `${value}${unit}` : `N/A`;
        if (valueElement) valueElement.textContent = displayValue;

        if (progressElement) {
            const percentage = (value !== null && value !== undefined) ? Math.max(0, Math.min(100, parseFloat(value))) : 0;
            progressElement.style.width = `${percentage}%`;
            progressElement.classList.remove('high-usage', 'critical-usage');
            if (percentage > 90) progressElement.classList.add('critical-usage');
            else if (percentage > 70) progressElement.classList.add('high-usage');
        }
    } catch(e) {
        console.error("Error updating stat element:", e);
    }
}

function initializeCharts() {
    const style = getComputedStyle(document.documentElement);
    const gridColor = style.getPropertyValue('--color-surface1').trim() + '80';
    const tickColor = style.getPropertyValue('--color-subtext1').trim();

    const commonOptions = (maxY = 100, suggestedMaxY, isPercentage = false) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                max: maxY,
                suggestedMax: suggestedMaxY,
                display: true,
                grid: {
                    display: true,
                    color: gridColor,
                    drawBorder: false,
                    lineWidth: 1,
                },
                ticks: {
                    display: true,
                    color: tickColor,
                    font: {
                        size: 10
                    },
                    padding: 5,
                    stepSize: isPercentage ? 25 : undefined,
                    callback: function(value) {
                        if (isPercentage) {
                            return value + '%';
                        }
                        return value + ' Mbps';
                    }
                }
            },
            x: {
                display: false,
                grid: {
                    display: false
                }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
        },
        elements: {
            point: { radius: 0 },
            line: {
                borderWidth: 2,
                tension: 0.3,
            }
        },
        animation: false,
    });

    const createChart = (canvasElement, dataKey, color, maxY, suggestedMaxY) => {
        if (!canvasElement) {
            console.error(`Canvas element for ${dataKey} not found!`);
            return;
        }
        try {
            const ctx = canvasElement.getContext('2d');
            if (!ctx) {
                 console.error(`Could not get 2D context for ${dataKey} canvas!`);
                 return;
            }
            if (!chartDataHistory[dataKey]) chartDataHistory[dataKey] = [];

            while (chartDataHistory[dataKey].length < MAX_HISTORY) {
                chartDataHistory[dataKey].unshift(null);
            }

            const isPercentage = ['cpu', 'ram', 'gpu', 'vram'].includes(dataKey);
            const chartOptions = commonOptions(maxY, suggestedMaxY, isPercentage);

            chartInstances[dataKey] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: CHART_LABELS,
                    datasets: [{
                        label: dataKey.toUpperCase(),
                        data: chartDataHistory[dataKey],
                        borderColor: color,
                        backgroundColor: `${color}33`,
                        fill: true,
                        spanGaps: true
                    }]
                },
                options: chartOptions
            });
        } catch (e) {
            console.error(`Error creating chart for ${dataKey}:`, e);
        }
    };

    try {
        const cpuColor = style.getPropertyValue('--color-green').trim();
        const ramColor = style.getPropertyValue('--color-yellow').trim();
        const gpuColor = style.getPropertyValue('--color-red').trim();
        const vramColor = style.getPropertyValue('--color-peach').trim();
        const downColor = style.getPropertyValue('--color-blue').trim();
        const upColor = style.getPropertyValue('--color-sky').trim();

        createChart(statElements.cpuChartCanvas, 'cpu', cpuColor, 100);
        createChart(statElements.ramChartCanvas, 'ram', ramColor, 100);
        createChart(statElements.gpuChartCanvas, 'gpu', gpuColor, 100);
        createChart(statElements.vramChartCanvas, 'vram', vramColor, 100);
        createChart(statElements.downChartCanvas, 'down', downColor, undefined, 10);
        createChart(statElements.upChartCanvas, 'up', upColor, undefined, 10);
    } catch (e) {
        console.error("Error during chart color fetching or creation:", e);
    }
}


function createDiskUI() {
    diskUsageContainer.innerHTML = '';
    if (!Array.isArray(trackedDisks)) trackedDisks = [];

    trackedDisks.forEach(diskPath => {
        if (typeof diskPath !== 'string') return;
        const diskId = `disk-${diskPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const diskItem = document.createElement('div');
        diskItem.className = 'disk-item';
        diskItem.id = diskId;
        diskItem.innerHTML = `
            <div class="disk-label" title="${diskPath}">${diskPath}</div>
            <div class="disk-percentage">--%</div>
            <span class="disk-percentage-label">Free</span>
            <div class="disk-progress-container"><div class="disk-progress-bar"></div></div>
            <div class="disk-details">-- GB / -- GB</div>
        `;
        diskUsageContainer.appendChild(diskItem);
    });
}

async function updateDiskUsage() {
    if (!Array.isArray(trackedDisks)) return;

    for (const diskPath of trackedDisks) {
        if (typeof diskPath !== 'string') continue;

        const diskId = `disk-${diskPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const diskElement = document.getElementById(diskId);
        if (!diskElement) continue;

        const percentageEl = diskElement.querySelector('.disk-percentage');
        const detailsEl = diskElement.querySelector('.disk-details');
        const progressBar = diskElement.querySelector('.disk-progress-bar');
        const labelEl = diskElement.querySelector('.disk-label');

        try {
            const usage = await window.electronAPI.checkDiskUsage(diskPath);
            const freePercent = parseFloat(usage.freePercentage);
            const usedPercent = 100 - freePercent;

            if (percentageEl) percentageEl.textContent = `${freePercent.toFixed(1)}%`;
            if (detailsEl) detailsEl.textContent = `${usage.freeGB} GB free / ${usage.totalGB} GB`;
            if (progressBar) {
                progressBar.style.width = `${usedPercent}%`;
                progressBar.classList.remove('high-usage', 'critical-usage');
                if (usedPercent > 90) progressBar.classList.add('critical-usage');
                else if (usedPercent > 75) progressBar.classList.add('high-usage');
            }
            if (labelEl) labelEl.title = diskPath;

        } catch (error) {
            console.error(`Error updating disk ${diskPath}:`, error);
            if (percentageEl) percentageEl.textContent = `Error`;
            if (detailsEl) detailsEl.textContent = `---`;
            if (progressBar) {
                 progressBar.style.width = '0%';
                 progressBar.classList.remove('high-usage');
                 progressBar.classList.add('critical-usage');
            }
            if (labelEl) labelEl.title = `${diskPath}\nError: ${error.message}`;
        }
    }
}

function startDiskUpdates() {
    if (diskUpdateInterval) clearInterval(diskUpdateInterval);
    updateDiskUsage();
    diskUpdateInterval = setInterval(updateDiskUsage, 60000);
}

async function handleNotesSave() {
    const currentNotes = notesTextarea.value;
    try {
        await window.electronAPI.saveNotes(currentNotes);
    } catch (error) {
        console.error('Failed to save notes from renderer:', error);
    }
}

async function loadAndDisplayNotes() {
    try {
        const notesContent = await window.electronAPI.loadNotes();
        notesTextarea.value = notesContent || '';
    } catch (error) {
        console.error('Failed to load notes:', error);
        notesTextarea.value = 'Error loading notes.';
    }
}

function renderShortcuts() {
    shortcutList.innerHTML = '';
    if (!currentSettings || !Array.isArray(currentSettings.shortcuts) || currentSettings.shortcuts.length === 0) {
        shortcutList.innerHTML = '<li class="shortcut-placeholder">No shortcuts added yet.</li>';
        return;
    }

    const folders = currentSettings.shortcuts.filter(s => s && s.type === 'folder');
    const apps = currentSettings.shortcuts.filter(s => s && s.type !== 'folder');

    const createListItem = (shortcut, originalIndex) => {
        if (!shortcut || typeof shortcut.path !== 'string' || typeof shortcut.name !== 'string' || typeof shortcut.type !== 'string') {
            console.warn(`Invalid shortcut object at original index ${originalIndex}:`, shortcut);
            return null;
        }
        const listItem = document.createElement('li');
        listItem.className = 'shortcut-item';
        listItem.dataset.index = originalIndex;
        listItem.dataset.path = shortcut.path;
        listItem.title = shortcut.path;

        const iconClass = shortcut.type === 'folder' ? 'fa-regular fa-folder' : 'fa-solid fa-rocket';
        listItem.innerHTML = `
            <span class="shortcut-icon"><i class="${iconClass}"></i></span>
            <span class="shortcut-name">${shortcut.name}</span>
            <button class="remove-shortcut-btn" title="Remove Shortcut"><i class="fas fa-times"></i></button>
        `;
        return listItem;
    };

    folders.forEach(shortcut => {
         const originalIndex = currentSettings.shortcuts.findIndex(s => s === shortcut);
         const listItem = createListItem(shortcut, originalIndex);
         if (listItem) shortcutList.appendChild(listItem);
    });

    if (folders.length > 0 && apps.length > 0) {
        const separator = document.createElement('li');
        separator.className = 'shortcut-separator';
        shortcutList.appendChild(separator);
    }

    apps.forEach(shortcut => {
        const originalIndex = currentSettings.shortcuts.findIndex(s => s === shortcut);
        const listItem = createListItem(shortcut, originalIndex);
        if (listItem) shortcutList.appendChild(listItem);
    });
}

async function handleAddShortcut(event) {
    const button = event.currentTarget;
    const type = button.dataset.type;
    try {
        const selectedPath = await window.electronAPI.selectPath(type);
        if (selectedPath) {
            const name = selectedPath.split(/\/|\\/).pop() || selectedPath;
            const newShortcut = { name, path: selectedPath, type };

            if (!Array.isArray(currentSettings.shortcuts)) currentSettings.shortcuts = [];
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
        event.stopPropagation();
        const indexToRemove = parseInt(shortcutItem.dataset.index, 10);
        if (!isNaN(indexToRemove) && Array.isArray(currentSettings.shortcuts) && indexToRemove >= 0 && indexToRemove < currentSettings.shortcuts.length) {
            currentSettings.shortcuts.splice(indexToRemove, 1);
            saveAndRerenderShortcuts();
        } else {
            console.error("Could not remove shortcut, invalid index or shortcuts array:", indexToRemove, currentSettings.shortcuts);
        }
    } else if (shortcutItem) {
        const pathToOpen = shortcutItem.dataset.path;
        if (pathToOpen) window.electronAPI.openShortcut(pathToOpen);
    }
}

async function saveAndRerenderShortcuts() {
    try {
        await window.electronAPI.saveSettings({ shortcuts: currentSettings.shortcuts });
        renderShortcuts();
    } catch (error) {
        console.error("Error saving settings after shortcut change:", error);
        alert("Could not save shortcut changes. See console for details.");
    }
}

window.addEventListener('beforeunload', () => {
    window.electronAPI.removeSystemInfoListener();
    window.electronAPI.removeSettingsUpdatedListener();
    if (diskUpdateInterval) clearInterval(diskUpdateInterval);
});