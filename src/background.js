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
                log("No active downloads. Stopping update interval.");
                clearInterval(updateInterval);
                updateInterval = null;
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
    const headers = "id,filename,percentage,speed,remaining_time,total_bytes,start_time,timestamp\n";
    const values = downloadStatsArray.map(stats =>
        `${stats.id},${stats.filename},${stats.percentage},${stats.speed},${stats.remaining_time},${stats.totalBytes},${stats.startTime},${stats.timestamp}`
    ).join("\n");
    return headers + values;
}
