document.addEventListener('DOMContentLoaded', function () {
    updatePopup();
});

function updatePopup() {
    chrome.downloads.search({}, function (downloads) {
        let list = document.getElementById('download-list');
        list.innerHTML = ''; // Clear previous list
        let now = Date.now();
        const RECENT_DOWNLOAD_TIME_LIMIT = 10 * 60 * 1000; // 10 minutes

        downloads.forEach((download) => {
            // Ignore old downloads (completed over 10 minutes ago)
            if (download.state === "complete" && now - download.endTime > RECENT_DOWNLOAD_TIME_LIMIT) {
                return;
            }

            let li = document.createElement('li');
            let progress = download.totalBytes > 0 ? (download.bytesReceived / download.totalBytes) * 100 : 0;
            let estimatedTime = download.estimatedTime ? `${Math.round(download.estimatedTime)}s` : "Unknown";

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

        // Add event listeners for pause, resume, and cancel buttons
        document.querySelectorAll('.pause-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                chrome.downloads.pause(parseInt(this.dataset.id));
            });
        });

        document.querySelectorAll('.resume-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                chrome.downloads.resume(parseInt(this.dataset.id));
            });
        });

        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                chrome.downloads.cancel(parseInt(this.dataset.id));
            });
        });
    });
}

// Refresh UI every second
setInterval(updatePopup, 1000);
