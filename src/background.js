importScripts("logger.js", "storage.js");

let updateInterval = null; // Holds our interval reference

function checkActiveDownloads() {
    chrome.downloads.search({ state: "in_progress" }, (downloads) => {
        if (downloads.length > 0) {
            if (!updateInterval) {
                log("New active downloads detected. Starting update interval.");
                updateInterval = setInterval(() => {
                    try {
                        chrome.runtime.sendMessage({ type: "DOWNLOAD_PROGRESS_UPDATE" });
                    } catch (error) {
                        log("No active popup to receive the message. Ignoring.");
                    }
                }, 1000);
            }
        } else {
            if (updateInterval) {
                log("No active downloads detected. Waiting before stopping update interval.");
                setTimeout(() => {
                    chrome.downloads.search({ state: "in_progress" }, (newDownloads) => {
                        if (newDownloads.length === 0) {
                            log("Confirmed no active downloads. Stopping update interval.");
                            clearInterval(updateInterval);
                            updateInterval = null;
                        } else {
                            log("New downloads detected, keeping update interval running.");
                        }
                    });
                }, 1000); // Wait 1 seconds before stopping to allow UI updates
            }
        }
    });
}

// Check every second if downloads are active and start/stop the interval accordingly
setInterval(checkActiveDownloads, 1000);

chrome.downloads.onChanged.addListener(async (downloadDelta) => {
    if (downloadDelta.state && downloadDelta.state.current === "complete") {
        log("Download completed:", downloadDelta);

        chrome.downloads.search({ id: downloadDelta.id }, async (results) => {
            if (results.length > 0) {
                const download = results[0];

                // Retrieve all stored stats for this download
                const storedStats = await getDownloadStats(download.id);
                if (!storedStats || storedStats.length === 0) {
                    log("No stats found for completed download:", download.id);
                    return;
                }

                // Convert stats to CSV format
                const csvData = convertToCSV(storedStats);
                log("Generated CSV:\n", csvData);

                // TODO: Upload CSV to Google Cloud Storage
                // For now, we just log it

                // Delete stats after processing
                await deleteDownloadStats(download.id);
                log("Deleted stats for completed download:", download.id);
            }
        });
    }
});

// Convert JSON data to CSV format
function convertToCSV(downloadStatsArray) {
    const headers = "id,filename,percentage,speed,remaining_time,estimator_type,total_bytes,received_bytes,start_time,current_time\n";
    const values = downloadStatsArray.map(stats =>
        `${stats.id},${stats.filename},${stats.percentage},${stats.speed},${stats.remaining_time},${stats.estimatorType},${stats.totalBytes},${stats.receivedBytes},${stats.startTime},${stats.currentTime}`
    ).join("\n");
    return headers + values;
}
