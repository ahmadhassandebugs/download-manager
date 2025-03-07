/**
 * Download Manager - Background Script
 * Handles download tracking, statistics collection, and events
 */

importScripts("estimator.js");

// ======= CONSTANTS & GLOBALS =======
const STATS_STORAGE_INTERVAL = 1000; // Store stats every second
const DEBUG = true;

// In-memory storage for download statistics
const downloadsStats = {};
let storageInterval = null;

// ======= INITIALIZATION =======
// Ensure stats are stored while downloads are active
setInterval(storeDownloadStats, STATS_STORAGE_INTERVAL);

// ======= EVENT LISTENERS =======
/**
 * Track new downloads
 */
chrome.downloads.onCreated.addListener((download) => {
    log(`New download created: ${getFilename(download)}`);
    startStatsStorage();

    // Add this code to notify popup about new downloads
    const progress = Math.round((download.bytesReceived / download.totalBytes) * 100) || 0;
    
    // Notify popup about the new download
    notifyPopup("NEW_DOWNLOAD", {
        id: download.id,
        filename: getFilename(download),
        progress: progress,
        state: download.state,
        bytesReceived: download.bytesReceived,
        totalBytes: download.totalBytes,
        speed: "0 B/s",
        remainingTime: "Calculating..."
    });
});

/**
 * Handle download state changes (progress, pause, resume, completion)
 */
chrome.downloads.onChanged.addListener((downloadDelta) => {
    const downloadId = downloadDelta.id;
    
    // Handle state changes
    if (downloadDelta.state) {
        const newState = downloadDelta.state.current;
        
        // Handle completed downloads
        if (newState === "complete") {
            handleCompletedDownload(downloadId);
        }
        // Handle paused downloads
        else if (newState === "paused") {
            log(`Download #${downloadId} paused`);
            notifyPopup("DOWNLOAD_STATE_CHANGE", { id: downloadId, state: "paused" });
        }
        // Handle resumed downloads
        else if (newState === "in_progress") {
            log(`Download #${downloadId} in progress`);
            notifyPopup("DOWNLOAD_STATE_CHANGE", { id: downloadId, state: "in_progress" });
        }
        // Handle interrupted/canceled downloads
        else if (newState === "interrupted") {
            handleInterruptedDownload(downloadId, downloadDelta.error?.current);
        }
    }
    
    // Handle progress updates directly
    if (downloadDelta.bytesReceived) {
        updateDownloadProgress(downloadId);
    }
});

/**
 * Handle communication with popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch(message.action) {
        case "getActiveDownloads":
            getActiveDownloads(sendResponse);
            return true; // Keep channel open for async response
            
        case "pauseDownload":
            pauseDownload(message.downloadId, sendResponse);
            return true;
            
        case "resumeDownload":
            resumeDownload(message.downloadId, sendResponse);
            return true;
            
        case "cancelDownload":
            cancelDownload(message.downloadId, sendResponse);
            return true;
    }
});

// ======= FUNCTION IMPLEMENTATIONS =======

/**
 * Store statistics for all active downloads
 */
function storeDownloadStats() {
    chrome.downloads.search({ state: "in_progress" }, (downloads) => {
        if (downloads.length > 0) {
            for (const download of downloads) {

                // Check if there's been any change since last entry
                if (downloadsStats[download.id] && downloadsStats[download.id].length > 0) {
                    const lastEntry = downloadsStats[download.id][downloadsStats[download.id].length - 1];
                    
                    // Skip if no change in bytes
                    if (lastEntry.receivedBytes === download.bytesReceived) {
                        continue; // Skip to next download
                    }
                }

                const progress = Math.round((download.bytesReceived / download.totalBytes) * 100) || 0;
                const estimation = estimator.calculate(download);

                // Create array for this download if it doesn't exist
                if (!downloadsStats[download.id]) {
                    downloadsStats[download.id] = [];
                    log(`Started tracking download #${download.id}: ${getFilename(download)}`);
                }

                // Add the current stats to the array
                downloadsStats[download.id].push({
                    id: download.id,
                    filename: getFilename(download),
                    percentage: progress,
                    speed: estimation.speed,
                    remaining_time: estimation.remainingTime,
                    estimatorType: estimation.estimatorType,
                    totalBytes: download.totalBytes,
                    receivedBytes: download.bytesReceived,
                    startTime: estimation.startTime,
                    currentTime: estimation.currentTime,
                });
                
                // Send a message to update any open popups
                notifyPopup("DOWNLOAD_PROGRESS_UPDATE", {
                    id: download.id,
                    filename: getFilename(download),
                    progress,
                    speed: estimation.speed,
                    remainingTime: estimation.remainingTime,
                    bytesReceived: download.bytesReceived,
                    totalBytes: download.totalBytes
                });
            }
        } else {
            if (storageInterval) {
                log("No active downloads. Stopping stats storage.");
                clearInterval(storageInterval);
                storageInterval = null;
            }
        }
    });
}

/**
 * Start the stats storage interval
 */
function startStatsStorage() {
    if (!storageInterval) {
        log(`Starting stats storage interval every ${STATS_STORAGE_INTERVAL}ms`);
        storageInterval = setInterval(storeDownloadStats, STATS_STORAGE_INTERVAL);
    }
}

/**
 * Handle a completed download
 */
function handleCompletedDownload(downloadId) {
    chrome.downloads.search({ id: downloadId }, (results) => {
        if (results.length > 0) {
            const download = results[0];
            log(`Download completed: ${getFilename(download)}`);
            
            // Generate and log CSV data
            if (downloadsStats[downloadId] && downloadsStats[downloadId].length > 0) {
                const csvData = convertToCSV(downloadsStats[downloadId]);
                log(`Download #${downloadId} stats:\n`, csvData);
                
                // Clean up
                delete downloadsStats[downloadId];
                
                // Notify popup of completion
                notifyPopup("DOWNLOAD_COMPLETED", { 
                    id: downloadId,
                    filename: getFilename(download),
                    bytesReceived: download.bytesReceived,
                    totalBytes: download.totalBytes
                });
            }
        }
    });
}

/**
 * Handle interrupted downloads (canceled or errors)
 */
function handleInterruptedDownload(downloadId, error) {
    if (error === "USER_CANCELED") {
        log(`Download #${downloadId} canceled by user`);
        handleCanceledDownload(downloadId);
    } else if (error) {
        log(`Download #${downloadId} failed: ${error}`);
        handleFailedDownload(downloadId, error);
    }
}

/**
 * Handle a canceled download
 */
function handleCanceledDownload(downloadId) {
    // Clean up stats for canceled download
    delete downloadsStats[downloadId];
    
    // Notify popup
    notifyPopup("DOWNLOAD_CANCELED", { id: downloadId });
}

/**
 * Handle a failed download
 */
function handleFailedDownload(downloadId, error) {
    // Generate and log CSV data even for failed downloads
    if (downloadsStats[downloadId] && downloadsStats[downloadId].length > 0) {
        const csvData = convertToCSV(downloadsStats[downloadId]);
        log(`Failed download #${downloadId} stats (${error}):\n`, csvData);
        
        // Clean up
        delete downloadsStats[downloadId];
    }
    
    // Notify popup
    notifyPopup("DOWNLOAD_FAILED", { id: downloadId, error });
}

/**
 * Update progress information for a specific download
 */
function updateDownloadProgress(downloadId) {
    chrome.downloads.search({ id: downloadId }, (results) => {
        if (results.length > 0) {
            const download = results[0];
            const progress = Math.round((download.bytesReceived / download.totalBytes) * 100) || 0;
            
            // Send a quick update to the popup
            notifyPopup("DOWNLOAD_PROGRESS_UPDATE", {
                id: downloadId,
                filename: getFilename(download),
                progress,
                bytesReceived: download.bytesReceived,
                totalBytes: download.totalBytes
            });
        }
    });
}

/**
 * Get list of active downloads for the popup
 */
function getActiveDownloads(sendResponse) {
    chrome.downloads.search({ state: "in_progress" }, (downloads) => {
        const activeDownloads = downloads.map(download => {
            const stats = downloadsStats[download.id] ? 
                downloadsStats[download.id][downloadsStats[download.id].length - 1] : null;
            
            return {
                id: download.id,
                filename: getFilename(download),
                progress: Math.round((download.bytesReceived / download.totalBytes) * 100) || 0,
                state: download.state,
                bytesReceived: download.bytesReceived,
                totalBytes: download.totalBytes,
                speed: stats ? stats.speed : "0 B/s",
                remainingTime: stats ? stats.remaining_time : "Unknown"
            };
        });
        
        log(`Sending ${activeDownloads.length} active downloads to popup`);
        sendResponse({ success: true, downloads: activeDownloads });
    });
}

/**
 * Pause a download
 */
function pauseDownload(downloadId, sendResponse) {
    chrome.downloads.pause(downloadId, () => {
        const success = !chrome.runtime.lastError;
        if (!success) {
            log(`Error pausing download #${downloadId}:`, chrome.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Resume a download
 */
function resumeDownload(downloadId, sendResponse) {
    chrome.downloads.resume(downloadId, () => {
        const success = !chrome.runtime.lastError;
        if (!success) {
            log(`Error resuming download #${downloadId}:`, chrome.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Cancel a download
 */
function cancelDownload(downloadId, sendResponse) {
    chrome.downloads.cancel(downloadId, () => {
        const success = !chrome.runtime.lastError;
        if (!success) {
            log(`Error canceling download #${downloadId}:`, chrome.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Send a message to the popup
 */
function notifyPopup(type, data) {
    chrome.runtime.sendMessage({ type, data }).catch(() => {
        // Ignore errors when popup isn't open
    });
}

/**
 * Convert JSON data to CSV format
 */
function convertToCSV(downloadStatsArray) {
    const headers = "id,filename,percentage,speed,remaining_time,estimator_type,total_bytes,received_bytes,start_time,current_time\n";
    const values = downloadStatsArray.map(stats =>
        `${stats.id},${stats.filename},${stats.percentage},${stats.speed},${stats.remaining_time},${stats.estimatorType},${stats.totalBytes},${stats.receivedBytes},${stats.startTime},${stats.currentTime}`
    ).join("\n");
    return headers + values;
}

/**
 * Extract filename from download object
 */
function getFilename(download) {
    return download.filename.split(/[/\\]/).pop();
}

/**
 * Debug logging
 */
function log(...args) {
    if (DEBUG) {
        console.log("[Background]", ...args);
    }
}
