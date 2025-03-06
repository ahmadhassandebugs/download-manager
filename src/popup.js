document.addEventListener("DOMContentLoaded", function () {
    const downloadsList = document.getElementById("downloads-list");

    function updateDownloadList() {
        log("Updating download list...");
        chrome.downloads.search({ state: "in_progress" }, (downloads) => {
            downloadsList.innerHTML = "";
            if (downloads.length === 0) {
                downloadsList.innerHTML = "<p>No active downloads</p>";
                return;
            }

            downloads.forEach((download) => {
                const progress = Math.round((download.bytesReceived / download.totalBytes) * 100) || 0;
                const estimation = estimator.calculate(download);
                const formattedSpeed = formatSpeed(parseFloat(estimation.speed));
                const formattedTime = estimation.remainingTime !== "Unknown" ? formatTime(parseFloat(estimation.remainingTime)) : "Unknown";
                const basename = getBasename(download.filename);

                // Store the stats in IndexedDB
                const downloadStats = {
                    id: download.id,
                    percentage: progress,
                    speed: estimation.speed,
                    remaining_time: estimation.remainingTime,
                    estimatorType: estimation.estimatorType,
                    totalBytes: download.totalBytes,
                    receivedBytes: download.bytesReceived,
                    startTime: estimation.startTime,
                    currentTime: estimation.currentTime,
                };

                saveActiveDownload(downloadStats);

                // Update UI
                const item = document.createElement("div");
                item.classList.add("download-item");
                item.innerHTML = `
                    <p>${basename} - ${progress}%</p>
                    <p>Speed: ${formattedSpeed} | Remaining Time: ${formattedTime}</p>
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="controls">
                        <button class="pause-resume" data-id="${download.id}">
                            ${download.paused ? "Resume" : "Pause"}
                        </button>
                        <button class="cancel" data-id="${download.id}">Cancel</button>
                    </div>
                `;
                downloadsList.appendChild(item);
            });

            log("Downloads list updated:", downloads);
            addEventListeners();
        });
    }

    function addEventListeners() {
        document.querySelectorAll(".pause-resume").forEach((button) => {
            button.addEventListener("click", function () {
                const downloadId = parseInt(this.getAttribute("data-id"));
                log(`Pause/Resume button clicked for Download ID: ${downloadId}`);

                chrome.downloads.search({ id: downloadId }, (results) => {
                    if (results.length > 0) {
                        if (results[0].paused) {
                            log(`Resuming download: ${downloadId}`);
                            chrome.downloads.resume(downloadId);
                        } else {
                            log(`Pausing download: ${downloadId}`);
                            chrome.downloads.pause(downloadId);
                        }
                        updateDownloadList();
                    }
                });
            });
        });

        document.querySelectorAll(".cancel").forEach((button) => {
            button.addEventListener("click", function () {
                const downloadId = parseInt(this.getAttribute("data-id"));
                log(`Cancel button clicked for Download ID: ${downloadId}`);
                chrome.downloads.cancel(downloadId);
                updateDownloadList();
            });
        });
    }

    // Listen for messages from background.js for UI updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "DOWNLOAD_PROGRESS_UPDATE") {
            log("Received DOWNLOAD_PROGRESS_UPDATE message. Updating UI.");
            updateDownloadList();
        }
    });

    // Initial update when popup is opened
    updateDownloadList();
});

function formatSpeed(speed) {
    if (speed < 1024) return speed.toFixed(2) + " B/s";
    if (speed < 1048576) return (speed / 1024).toFixed(2) + " KB/s";
    if (speed < 1073741824) return (speed / 1048576).toFixed(2) + " MB/s";
    return (speed / 1073741824).toFixed(2) + " GB/s";
}

function formatTime(seconds) {
    if (seconds < 60) return seconds.toFixed(0) + " sec";
    if (seconds < 3600) return (seconds / 60).toFixed(0) + " min";
    return (seconds / 3600).toFixed(1) + " hr";
}

function getBasename(filename) {
    return filename.split(/[/\\]/).pop();
}
