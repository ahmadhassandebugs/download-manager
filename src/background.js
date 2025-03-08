/**
 * Download Manager - Background Script
 * Handles download tracking, statistics collection, and events
 */

importScripts("estimator.js");
importScripts("storage.js");

// ======= CONSTANTS & GLOBALS =======
const STATS_STORAGE_INTERVAL = 1000; // Store stats every second
const DEBUG = true;
const extensionAPI = typeof browser !== "undefined" ? browser : chrome;

// In-memory storage for download statistics
const downloadsStats = {};
let storageInterval = null;
let currentSessionId = null;
let userAgent = "Unknown User Agent";
let platform = "Unknown Platform";

// ======= INITIALIZATION =======
// Check for existing session ID or create a new one
initSession();

// User agent and platform information
getPlatformAndBrowser().then(({ os, browserName }) => {
    userAgent = browserName;
    platform = os;
    log("User Agent:", userAgent);
    log("Platform:", platform);
});

// Ensure stats are stored while downloads are active
setInterval(storeDownloadStats, STATS_STORAGE_INTERVAL);

// ======= EVENT LISTENERS =======
/**
 * Track new downloads
 */
extensionAPI.downloads.onCreated.addListener((download) => {
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
extensionAPI.downloads.onChanged.addListener((downloadDelta) => {
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
});

/**
 * Handle communication with popup
 */
extensionAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
 * initSession - Initialize the session ID
 */
function initSession() {
    StorageUtil.getValue("session_id").then((sessionId) => {
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            StorageUtil.set({ session_id: sessionId });
            currentSessionId = sessionId;
            log("New session ID created:", sessionId);
        } else {
            currentSessionId = sessionId;
            log("Session ID loaded:", sessionId);
        }
    });
}   

/**
 * Store statistics for all active downloads
 */
function storeDownloadStats() {
    extensionAPI.downloads.search({ state: "in_progress" }, (downloads) => {
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
                    progress: progress,
                    speed: estimation.speed,
                    remainingTime: estimation.remainingTime,
                    receivedBytes: download.bytesReceived,
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
    extensionAPI.downloads.search({ id: downloadId }, (results) => {
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
 * Get list of active downloads for the popup
 */
function getActiveDownloads(sendResponse) {
    extensionAPI.downloads.search({ state: "in_progress" }, (downloads) => {
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
    extensionAPI.downloads.pause(downloadId, () => {
        const success = !extensionAPI.runtime.lastError;
        if (!success) {
            log(`Error pausing download #${downloadId}:`, extensionAPI.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Resume a download
 */
function resumeDownload(downloadId, sendResponse) {
    extensionAPI.downloads.resume(downloadId, () => {
        const success = !extensionAPI.runtime.lastError;
        if (!success) {
            log(`Error resuming download #${downloadId}:`, extensionAPI.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Cancel a download
 */
function cancelDownload(downloadId, sendResponse) {
    extensionAPI.downloads.cancel(downloadId, () => {
        const success = !extensionAPI.runtime.lastError;
        if (!success) {
            log(`Error canceling download #${downloadId}:`, extensionAPI.runtime.lastError);
        }
        sendResponse({ success });
    });
}

/**
 * Send a message to the popup
 */
function notifyPopup(type, data) {
    extensionAPI.runtime.sendMessage({ type, data }).catch(() => {
        // Ignore errors when popup isn't open
    });
}

/**
 * Convert JSON data to CSV format
 */
function convertToCSV(downloadStatsArray) {
    const headers = "id,filename,percentage,speed,remaining_time,estimator_type,total_bytes,received_bytes,start_time,current_time,session_id,browser,platform\n";
    
    // Include the session ID, userAgent and platform in each row
    const values = downloadStatsArray.map(stats =>
        `${stats.id},"${stats.filename}",${stats.percentage},"${stats.speed}","${stats.remaining_time}","${stats.estimatorType}",${stats.totalBytes},${stats.receivedBytes},"${stats.startTime}","${stats.currentTime}","${currentSessionId}","${userAgent}","${platform}"`
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

/**
 * Get platform and browser information
 */
async function getPlatformAndBrowser() {
    // Detect OS using browser.runtime.getPlatformInfo()
    let os = "Unknown OS";
    if (extensionAPI.runtime.getPlatformInfo) {
        try {
            const platformInfo = await extensionAPI.runtime.getPlatformInfo();
            os = platformInfo.os;
        } catch (error) {
            console.error("Error getting platform info:", error);
        }
    }

    // Detect Browser using userAgentData or userAgent (fallback)
    let browserName = "Unknown Browser";
    if (navigator.userAgentData) {
        const brandEntry = navigator.userAgentData.brands.find(b => 
            !b.brand.includes("Not") && !b.brand.includes("Chromium")
        );
        if (brandEntry) {
            browserName = brandEntry.brand;
        }
    } else {
        const userAgent = navigator.userAgent;
        if (userAgent.includes("Chrome")) {
            browserName = "Chrome";
        } else if (userAgent.includes("Firefox")) {
            browserName = "Firefox";
        } else if (userAgent.includes("Edg")) {
            browserName = "Edge";
        } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
            browserName = "Safari";
        } else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
            browserName = "Opera";
        }
    }

    return { os, browserName };
}
