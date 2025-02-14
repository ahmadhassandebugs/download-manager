document.addEventListener('DOMContentLoaded', function () {
    console.log("[POPUP] Popup loaded.");
    updatePopup();
});

function updatePopup() {
    chrome.downloads.search({}, function (downloads) {
        console.log(`[POPUP] Found ${downloads.length} downloads.`);

        let list = document.getElementById('download-list');
        list.innerHTML = ''; // Clear previous list
        let now = Date.now();
        const TODAY = new Date().setHours(0, 0, 0, 0); // Midnight of today

        downloads.forEach((download) => {
            let downloadDate = new Date(download.startTime);

            // Ignore downloads older than today
            if (downloadDate.getTime() < TODAY) {
                console.log(`[POPUP] Skipped old download: ${download.filename}`);
                return;
            }

            let progress = download.totalBytes > 0 ? (download.bytesReceived / download.totalBytes) * 100 : 0;
            let estimatedTime = download.estimatedTime ? `${Math.round(download.estimatedTime)}s` : "Unknown";

            console.log(`[POPUP] Showing download: ${download.filename} - Progress: ${progress.toFixed(1)}%`);

            let li = document.createElement('li');
            li.innerHTML = `
                <div class="bg-gray-800 p-3 rounded">
                    <p class="text-sm">${download.filename.split('/').pop()}</p>
                    <div class="relative w-full bg-gray-700 rounded h-2 mt-2">
                        <div class="absolute top-0 left-0 bg-blue-500 h-2 rounded" style="width:${progress}%;"></div>
                    </div>
                    <p class="text-xs mt-2">Progress: ${progress.toFixed(1)}% | ETA: ${estimatedTime}</p>
                    <div class="mt-2 flex gap-2">
                        <button class="pause-btn bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded text-sm" data-id="${download.id}">Pause</button>
                        <button class="resume-btn bg-green-500 hover:bg-green-600 px-2 py-1 rounded text-sm" data-id="${download.id}">Resume</button>
                        <button class="cancel-btn bg-red-500 hover:bg-red-600 px-2 py-1 rounded text-sm" data-id="${download.id}">Cancel</button>
                    </div>
                </div>
            `;
            list.appendChild(li);
        });

        // Attach event listeners for Pause, Resume, and Cancel
        attachButtonListeners();
    });
}

// Attach event listeners after the elements are added
function attachButtonListeners() {
    document.querySelectorAll('.pause-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            let downloadId = parseInt(this.dataset.id);
            
            chrome.downloads.search({ id: downloadId }, function (results) {
                if (results.length === 0) return;
                let download = results[0];

                if (download.state === "in_progress") {
                    chrome.downloads.pause(downloadId, () => {
                        console.log(`[PAUSED] Download ID: ${downloadId}`);
                    });
                } else {
                    console.warn(`[ERROR] Cannot pause. Download is not in progress.`);
                }
            });
        });
    });

    document.querySelectorAll('.resume-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            let downloadId = parseInt(this.dataset.id);
            
            chrome.downloads.search({ id: downloadId }, function (results) {
                if (results.length === 0) return;
                let download = results[0];

                if (download.state === "paused") {
                    chrome.downloads.resume(downloadId, () => {
                        console.log(`[RESUMED] Download ID: ${downloadId}`);
                    });
                } else {
                    console.warn(`[ERROR] Cannot resume. Download is not paused.`);
                }
            });
        });
    });

    document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            let downloadId = parseInt(this.dataset.id);
            
            chrome.downloads.search({ id: downloadId }, function (results) {
                if (results.length === 0) return;
                let download = results[0];

                if (download.state !== "complete") {
                    chrome.downloads.cancel(downloadId, () => {
                        console.log(`[CANCELLED] Download ID: ${downloadId}`);
                    });
                } else {
                    console.warn(`[ERROR] Cannot cancel. Download is already completed.`);
                }
            });
        });
    });
}

// Refresh UI every second
setInterval(updatePopup, 1000);
