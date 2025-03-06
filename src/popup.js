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
                const speed = 0; // Placeholder function
                const remainingTime = 0; // Placeholder function

                // Store the stats in IndexedDB
                const downloadStats = {
                    id: download.id,
                    filename: download.filename.split("/").pop(),
                    percentage: progress,
                    speed: speed,
                    remaining_time: remainingTime,
                    totalBytes: download.totalBytes,
                    startTime: download.startTime,
                    endTime: new Date().toISOString(),
                };

                saveActiveDownload(downloadStats);

                // Update UI
                const item = document.createElement("div");
                item.classList.add("download-item");
                item.innerHTML = `
                    <p>${download.filename.split("/").pop()} - ${progress}%</p>
                    <p>Speed: ${speed} Mbps | Remaining Time: ${remainingTime} sec</p>
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
