importScripts("logger.js");

let updateInterval = null; // Holds our interval reference

function checkActiveDownloads() {
    chrome.downloads.search({ state: "in_progress" }, (downloads) => {
        if (downloads.length > 0) {
            // If downloads are active, start the update interval if not already running
            if (!updateInterval) {
                log("New active downloads detected. Starting update interval.");
                updateInterval = setInterval(() => {
                    chrome.runtime.sendMessage({ type: "DOWNLOAD_PROGRESS_UPDATE" });
                }, 1000);
            }
        } else {
            // No active downloads, stop the interval
            if (updateInterval) {
                log("No active downloads. Stopping update interval.");
                clearInterval(updateInterval);
                updateInterval = null; // Reset to allow future downloads to restart it
            }
        }
    });
}

// Check every second if downloads are active and start/stop the interval accordingly
setInterval(checkActiveDownloads, 1000);
