const si = require('systeminformation');
const os = require('os');
const { ipcRenderer } = require('electron');

si.powerShellStart();

const averagingPeriod = 5000; // 3 seconds, in milliseconds


// TIME SCRIPT
function updateTime() {
	const hoursElement = document.getElementById('hours');
	const minutesElement = document.getElementById('minutes');
	const secondsElement = document.getElementById('seconds');

	const date = new Date();
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');

	hoursElement.textContent = `${hours}`;
	minutesElement.textContent = `${minutes}`;
	secondsElement.textContent = `${seconds}`;

	const year = date.getFullYear();
	const monthElement = document.getElementById('month');
	const monthName = date.toLocaleString('default', { month: 'long' });
	const yearElement = document.getElementById('year');

	monthElement.textContent = monthName;
	yearElement.textContent = year;
}
updateTime();
setInterval(updateTime, 1000);

//CALLENDAR SCRIPT
document.addEventListener('DOMContentLoaded', function () {
	const calendarBody = document.getElementById('calendar-body');

	let currentDate = new Date();

	function renderCalendar(date) {
		calendarBody.innerHTML = '';
		const year = date.getFullYear();
		const month = date.getMonth();
		const today = new Date();

		const firstDay = new Date(year, month, 1).getDay();
		const lastDate = new Date(year, month + 1, 0).getDate();

		let day = 1;
		for (let i = 0; i < 6; i++) {
			const row = document.createElement('tr');

			for (let j = 0; j < 7; j++) {
				const cell = document.createElement('td');
				if (i === 0 && j < firstDay) {
					cell.textContent = '.';
				} else if (day > lastDate) {
					cell.textContent = '.';
				} else {
					cell.textContent = day;
					if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
						cell.classList.add('today'); // Add class for today's date
					}
					day++;
				}
				row.appendChild(cell);
			}
			calendarBody.appendChild(row);
		}
	}

	renderCalendar(currentDate);
});

const readings = {
	cpu: [],
  ram: [],
  gpu: [],
  vram: [],
  download: [],
  upload: []
};

function updateCPU() {
	si.currentLoad().then(data => {
		readings.cpu.push(data.currentLoad);
    if (readings.cpu.length > averagingPeriod / 1000) readings.cpu.shift();
    const avgCPU = readings.cpu.reduce((a, b) => a + b, 0) / readings.cpu.length;
    document.getElementById('cpu').textContent = `CPU: ${avgCPU.toFixed(2)}%`;
  });
}

function updateRAM() {
	const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsage = (usedMem / totalMem * 100);
  readings.ram.push(ramUsage);
  if (readings.ram.length > averagingPeriod / 1000) readings.ram.shift();
  const avgRAM = readings.ram.reduce((a, b) => a + b, 0) / readings.ram.length;
  document.getElementById('ram').textContent = `RAM: ${avgRAM.toFixed(2)}%`;
}

function updateGPU() {
	si.graphics().then(data => {
		if (data.controllers && data.controllers.length > 0) {
			const gpu = data.controllers[0];
      if (gpu.utilizationGpu) {
				readings.gpu.push(gpu.utilizationGpu);
        if (readings.gpu.length > averagingPeriod / 1000) readings.gpu.shift();
        const avgGPU = readings.gpu.reduce((a, b) => a + b, 0) / readings.gpu.length;
        document.getElementById('gpu').textContent = `GPU: ${avgGPU.toFixed(2)}%`;
      } else {
				document.getElementById('gpu').textContent = 'N/A';
      }
      if (gpu.memoryTotal) {
				const vramUsage = (gpu.memoryUsed / gpu.memoryTotal * 100);
        readings.vram.push(vramUsage);
        if (readings.vram.length > averagingPeriod / 1000) readings.vram.shift();
        const avgVRAM = readings.vram.reduce((a, b) => a + b, 0) / readings.vram.length;
        document.getElementById('vram').textContent = `VRAM: ${avgVRAM.toFixed(2)}%`;
      } else {
				document.getElementById('vram').textContent = 'N/A';
      }
    }
  });
}

function updateNetwork() {
	si.networkStats().then(data => {
		if (data && data.length > 0) {
			const networkData = data[0];
      const downloadSpeed = networkData.rx_sec / 125000; // Convert to Mbps
      const uploadSpeed = networkData.tx_sec / 125000; // Convert to Mbps
			
      readings.download.push(downloadSpeed);
      readings.upload.push(uploadSpeed);
			
      if (readings.download.length > averagingPeriod / 1000) readings.download.shift();
      if (readings.upload.length > averagingPeriod / 1000) readings.upload.shift();
			
      const avgDownload = readings.download.reduce((a, b) => a + b, 0) / readings.download.length;
      const avgUpload = readings.upload.reduce((a, b) => a + b, 0) / readings.upload.length;
			
      document.getElementById('download').textContent = `DOWNLOAD: ${avgDownload.toFixed(2)} Mbps`;
      document.getElementById('upload').textContent = `UPLOAD: ${avgUpload.toFixed(2)} Mbps`;
    }
  });
}

function updateAll() {
	updateCPU();
  updateRAM();
  updateGPU();
  updateNetwork();
}

updateAll(); // Initial update
setInterval(updateAll, 1000); // Update every second


// JavaScript code
let disks = [];

async function loadDisks() {
		disks = await ipcRenderer.invoke('get-disks');
		createDiskDivs();
}

function createDiskDivs() {
		const containerDiv = document.getElementById('disk-containers');
		disks.forEach(disk => {
				const diskDiv = document.createElement('div');
				diskDiv.id = `disk-${disk.replace(':', '')}`;
				diskDiv.className = 'disk-container';
				containerDiv.appendChild(diskDiv);
		});
}

async function updateUsage() {
		for (const disk of disks) {
				const diskDiv = document.getElementById(`disk-${disk.replace(':', '')}`);
				try {
						const usage = await ipcRenderer.invoke('check-disk-usage', disk);
						diskDiv.innerHTML = `${disk} ${usage.usedPercentage}%`;
				} catch (error) {
						diskDiv.innerHTML = `${disk}: Error - ${error.message}`;
				}
		}
}

loadDisks().then(() => {
		updateUsage(); // Initial update
		setInterval(updateUsage, 60000); // Update every 60 seconds
});

document.addEventListener('DOMContentLoaded', async () => {
  const notesParagraph = document.getElementById('notes');

  try {
    const notes = await ipcRenderer.invoke('load-notes');
    const notesContent = notes.join('\n').trim();

    if (notesContent) {
      notesParagraph.textContent = notesContent;
      notesParagraph.classList.remove('placeholder');
    } else {
      notesParagraph.textContent = 'View notes...';
      notesParagraph.classList.add('placeholder');
    }
  } catch (error) {
    console.error('Failed to load notes:', error);
    notesParagraph.textContent = 'View notes...';
    notesParagraph.classList.add('placeholder');
  }

  notesParagraph.addEventListener('click', async () => {
    try {
      await ipcRenderer.invoke('open-notes-file');
    } catch (error) {
      console.error('Failed to open notes file:', error);
    }
  });
});
