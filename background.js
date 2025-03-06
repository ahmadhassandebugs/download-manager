const SEND_LOGS_TO_AWS = false; // Set to true when AWS is ready
const RECENT_DOWNLOAD_TIME_LIMIT = 24 * 60 * 60 * 1000; // Keep downloads from today

class DownloadEstimator {
    constructor(downloadId, totalBytes) {
        this.downloadId = downloadId;
        this.totalBytes = totalBytes;
        this.bytesReceived = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = this.startTime;
        this.speedHistory = [];
    }

    update(bytesReceived) {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000; // seconds
        
        if (deltaTime > 0) {
            const speed = (bytesReceived - this.bytesReceived) / deltaTime; // bytes/sec
            this.speedHistory.push(speed);
            
            if (this.speedHistory.length > 5) this.speedHistory.shift();
        }
        
        this.lastUpdateTime = now;
        this.bytesReceived = bytesReceived;
    }

    getEstimatedTime() {
        if (this.speedHistory.length === 0 || this.totalBytes === -1) return "Unknown";
        const avgSpeed = this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
        
        if (avgSpeed <= 0) return "Unknown";
        
        const seconds = (this.totalBytes - this.bytesReceived) / avgSpeed;
        
        // Format time nicely
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds/60)}m ${Math.round(seconds%60)}s`;
        return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
    }
    
    getSpeed() {
        if (this.speedHistory.length === 0) return 0;
        return this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
    }
    
    getFormattedSpeed() {
        const speed = this.getSpeed();
        if (speed < 1024) return `${Math.round(speed)} B/s`;
        if (speed < 1024 * 1024) return `${Math.round(speed / 1024 * 10) / 10} KB/s`;
        return `${Math.round(speed / (1024 * 1024) * 10) / 10} MB/s`;
    }
}

// Store downloads
let activeDownloads = {};
let downloadHistory = [];
let speedLimit = 0; // 0 means no limit, otherwise bytes/sec

// Initialize with stored data
chrome.storage.local.get(['activeDownloads', 'downloadHistory', 'userId', 'speedLimit'], (result) => {
    if (result.activeDownloads) {
        // Recreate estimator objects
        Object.keys(result.activeDownloads).forEach(id => {
            const download = result.activeDownloads[id];
            if (download && download.estimator) {
                const estimator = new DownloadEstimator(
                    download.estimator.downloadId,
                    download.estimator.totalBytes
                );
                estimator.bytesReceived = download.estimator.bytesReceived;
                estimator.speedHistory = download.estimator.speedHistory || [];
                download.estimator = estimator;
            }
        });
        activeDownloads = result.activeDownloads;
    }
    
    if (result.downloadHistory) {
        downloadHistory = result.downloadHistory;
    }
    
    if (result.speedLimit) {
        speedLimit = result.speedLimit;
    }
    
    // Generate a userId if not exists
    if (!result.userId) {
        const userId = 'user_' + Math.random().toString(36).substr(2, 9);
        chrome.storage.local.set({userId});
    }
});

// Update storage
function updateStorage() {
    chrome.storage.local.set({
        activeDownloads,
        downloadHistory,
        speedLimit
    }, () => {
        // Use sendMessage but handle errors properly
        try {
            chrome.runtime.sendMessage({
                action: "dataUpdated",
                timestamp: Date.now() // Add timestamp to ensure it's seen as a new message
            }).catch(() => {
                // Ignore errors when popup isn't open
            });
        } catch (e) {
            // Ignore errors
        }
    });
}

// Listen for new downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
    let now = Date.now();
    let today = new Date().setHours(0, 0, 0, 0);
    let downloadDate = new Date(downloadItem.startTime);

    // Only track downloads from today or with no startTime (fresh downloads)
    if (!downloadItem.startTime || downloadDate.getTime() >= today) {
        // Create a more complete download object
        activeDownloads[downloadItem.id] = {
            id: downloadItem.id,
            estimator: new DownloadEstimator(downloadItem.id, downloadItem.totalBytes || -1),
            startTime: now,
            state: downloadItem.state || "in_progress", 
            filename: downloadItem.filename,
            url: downloadItem.url,
            mime: downloadItem.mime || "unknown",
            bytesReceived: downloadItem.bytesReceived || 0,
            totalBytes: downloadItem.totalBytes || -1,
            fileSize: downloadItem.fileSize || 0
        };
        
        updateStorage();
        console.log(`[NEW DOWNLOAD] ${downloadItem.filename} started. Download ID: ${downloadItem.id}`, activeDownloads[downloadItem.id]);
    } else {
        console.log(`[IGNORED] Old download: ${downloadItem.filename}`);
    }
});

// Update download progress
chrome.downloads.onChanged.addListener((downloadDelta) => {
    let download = activeDownloads[downloadDelta.id];
    if (!download) return;

    // Update bytesReceived whenever available
    if (downloadDelta.bytesReceived) {
        download.estimator.update(downloadDelta.bytesReceived.current);
        console.log(`[PROGRESS] Download ID: ${downloadDelta.id} | Bytes: ${download.estimator.bytesReceived} / ${download.estimator.totalBytes} | Speed: ${download.estimator.getFormattedSpeed()}`);
    }

    // Handle state changes
    if (downloadDelta.state) {
        const previousState = download.state;
        download.state = downloadDelta.state.current;
        
        console.log(`[STATE] Download ID: ${downloadDelta.id} changed from ${previousState} to ${download.state}`);

        if (download.state === "complete") {
            // Handle completion
            console.log(`[COMPLETED] Download ID: ${downloadDelta.id}`);
            
            // Add to history
            downloadHistory.unshift({
                id: download.id,
                filename: download.filename.split('/').pop(),
                url: download.url,
                startTime: new Date(download.startTime).toISOString(),
                endTime: new Date().toISOString(),
                fileSize: download.estimator.bytesReceived,
                mimeType: download.mime || "unknown",
                status: "Completed"
            });
            
            // Show notification
            chrome.notifications.create(`download-${downloadDelta.id}`, {
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'Download Complete',
                message: `${download.filename.split('/').pop()} has been downloaded successfully.`,
                buttons: [{title: 'Open File'}, {title: 'Open Folder'}]
            });
            
            // Clean up after delay
            setTimeout(() => {
                delete activeDownloads[downloadDelta.id];
                updateStorage();
            }, 5000); // Keep completed downloads visible for 5 seconds
        } 
        // Handle specific case of user cancellation (don't treat as error)
        else if (download.state === "interrupted" && downloadDelta.error && 
                downloadDelta.error.current === "USER_CANCELED") {
            console.log(`[CANCELED] Download ID: ${downloadDelta.id} was canceled by user`);
            
            // Add to history with canceled status
            downloadHistory.unshift({
                id: download.id,
                filename: download.filename.split('/').pop(),
                url: download.url,
                startTime: new Date(download.startTime).toISOString(),
                endTime: new Date().toISOString(),
                fileSize: download.estimator.bytesReceived,
                totalSize: download.estimator.totalBytes,
                mimeType: download.mime || "unknown",
                status: 'Canceled'
            });
            
            // Clean up immediately for canceled downloads
            setTimeout(() => {
                delete activeDownloads[downloadDelta.id];
                updateStorage();
            }, 1000);
        }
        // Handle other interruptions/errors
        else if (download.state === "interrupted" && downloadDelta.error) {
            download.error = downloadDelta.error.current;
            if (download.error !== "USER_CANCELED") {
                console.error(`[FAILED] Download ID: ${downloadDelta.id}, Error: ${download.error}`);
                
                // Add to history with error status
                downloadHistory.unshift({
                    id: download.id,
                    filename: download.filename.split('/').pop(),
                    url: download.url,
                    startTime: new Date(download.startTime).toISOString(),
                    endTime: new Date().toISOString(),
                    fileSize: download.estimator.bytesReceived,
                    totalSize: download.estimator.totalBytes,
                    mimeType: download.mime || "unknown",
                    status: `Failed: ${download.error}`
                });
                
                // Show error notification for genuine errors
                chrome.notifications.create(`download-error-${downloadDelta.id}`, {
                    type: 'basic',
                    iconUrl: 'icon-48.png',
                    title: 'Download Failed',
                    message: `Download of ${download.filename.split('/').pop()} failed: ${download.error}`
                });
                
                // Clean up failed downloads after delay
                setTimeout(() => {
                    delete activeDownloads[downloadDelta.id];
                    updateStorage();
                }, 5000);
            }
        }
    }

    // Update filename if changed
    if (downloadDelta.filename) {
        download.filename = downloadDelta.filename.current;
    }
    
    updateStorage();
});

// Add download to history
function addToHistory(downloadItem, downloadStats, status = "Completed") {
    const historyItem = {
        id: downloadItem.id,
        filename: downloadItem.filename.split('/').pop(),
        url: downloadItem.url,
        startTime: new Date(downloadItem.startTime).toISOString(),
        endTime: new Date().toISOString(),
        fileSize: downloadItem.fileSize || downloadStats.estimator.totalBytes,
        mimeType: downloadItem.mime,
        status: status,
        bytesReceived: downloadStats.estimator.bytesReceived
    };
    
    downloadHistory.unshift(historyItem); // Add to beginning of array
    
    // Limit history size to prevent excessive storage
    if (downloadHistory.length > 1000) {
        downloadHistory = downloadHistory.slice(0, 1000);
    }
    
    updateStorage();
}

// Log download stats
function logDownloadStats(downloadId, status) {
    let download = activeDownloads[downloadId];
    if (!download) return;

    let logData = {
        userId: chrome.storage.local.get('userId') || "Anonymous",
        browser: navigator.userAgent,
        os: navigator.platform,
        downloadId: downloadId,
        totalBytes: download.estimator.totalBytes,
        bytesReceived: download.estimator.bytesReceived,
        estimatedTime: download.estimator.getEstimatedTime(),
        speed: download.estimator.getFormattedSpeed(),
        estimationMethod: "Moving Average",
        status: status
    };

    if (SEND_LOGS_TO_AWS) {
        fetch("https://xyz.execute-api.us-west-1.amazonaws.com/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(logData)
        });
    } else {
        console.log(`[LOG]`, logData);
    }
}

// Batch operations
function pauseAllDownloads() {
    chrome.downloads.search({state: "in_progress"}, (downloads) => {
        downloads.forEach(download => {
            chrome.downloads.pause(download.id);
        });
    });
}

function resumeAllDownloads() {
    chrome.downloads.search({state: "paused"}, (downloads) => {
        downloads.forEach(download => {
            chrome.downloads.resume(download.id);
        });
    });
}

function cancelAllDownloads() {
    chrome.downloads.search({state: "in_progress"}, (downloads) => {
        downloads.forEach(download => {
            chrome.downloads.cancel(download.id);
        });
    });
}

// Handle speed limiting
function throttleDownloads() {
    if (speedLimit <= 0) return; // No limit
    
    const activeIds = Object.keys(activeDownloads).filter(id => 
        activeDownloads[id].state === "in_progress");
    
    if (activeIds.length === 0) return;
    
    // Calculate current total speed
    let totalSpeed = 0;
    activeIds.forEach(id => {
        const download = activeDownloads[id];
        if (download.estimator.speedHistory.length > 0) {
            totalSpeed += download.estimator.getSpeed();
        }
    });
    
    // If exceeding limit, pause some downloads temporarily
    if (totalSpeed > speedLimit) {
        const excessRatio = totalSpeed / speedLimit;
        const pauseCount = Math.ceil(activeIds.length / excessRatio);
        
        // Pause downloads to meet the limit
        for (let i = 0; i < pauseCount; i++) {
            const id = activeIds[i];
            if (activeDownloads[id].state === "in_progress") {
                chrome.downloads.pause(parseInt(id));
                setTimeout(() => {
                    chrome.downloads.resume(parseInt(id));
                }, 1000); // Resume after 1 second
            }
        }
    }
}

// Message handler for commands from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "pauseAll") {
        pauseAllDownloads();
        sendResponse({success: true});
    } else if (message.action === "resumeAll") {
        resumeAllDownloads();
        sendResponse({success: true});
    } else if (message.action === "cancelAll") {
        cancelAllDownloads();
        sendResponse({success: true});
    } else if (message.action === "setSpeedLimit") {
        speedLimit = message.limit;
        updateStorage();
        sendResponse({success: true});
    } else if (message.action === "getActiveDownloads") {
        console.log("[REQUEST] Sending active downloads:", Object.keys(activeDownloads).length, "downloads");
        sendResponse({
            success: true,
            downloads: serializeDownloadsForPopup()
        });
    } else if (message.action === "getHistory") {
        sendResponse({
            success: true,
            history: downloadHistory
        });
    } else if (message.action === "clearHistory") {
        downloadHistory = [];
        updateStorage();
        sendResponse({success: true});
    } else if (message.action === "refreshDownloads") {
        // Force refresh all download states from Chrome API
        chrome.downloads.search({}, (results) => {
            results.forEach(item => {
                if (activeDownloads[item.id]) {
                    // Update existing download with latest data
                    activeDownloads[item.id].state = item.state;
                    activeDownloads[item.id].bytesReceived = item.bytesReceived;
                    if (activeDownloads[item.id].estimator) {
                        activeDownloads[item.id].estimator.update(item.bytesReceived);
                    }
                } else if (item.state === "in_progress") {
                    // Add new in-progress download we might have missed
                    activeDownloads[item.id] = {
                        id: item.id,
                        estimator: new DownloadEstimator(item.id, item.totalBytes || -1),
                        startTime: Date.now(),
                        state: item.state,
                        filename: item.filename,
                        url: item.url,
                        mime: item.mime || "unknown",
                        bytesReceived: item.bytesReceived || 0,
                        totalBytes: item.totalBytes || -1,
                        fileSize: item.fileSize || 0
                    };
                }
            });
            updateStorage();
            sendResponse({
                success: true,
                downloads: activeDownloads
            });
        });
        return true; // Async response
    }
    return true; // Keep the message channel open for async response
});

// Add an initialization check when the background script starts
function initializeDownloads() {
    console.log("[INIT] Checking for existing downloads...");
    chrome.downloads.search({state: "in_progress"}, (results) => {
        if (results.length > 0) {
            console.log(`[INIT] Found ${results.length} in-progress downloads`);
            results.forEach(downloadItem => {
                if (!activeDownloads[downloadItem.id]) {
                    activeDownloads[downloadItem.id] = {
                        id: downloadItem.id,
                        estimator: new DownloadEstimator(downloadItem.id, downloadItem.totalBytes || -1),
                        startTime: Date.now(),
                        state: "in_progress",
                        filename: downloadItem.filename,
                        url: downloadItem.url,
                        mime: downloadItem.mime || "unknown",
                        bytesReceived: downloadItem.bytesReceived || 0,
                        totalBytes: downloadItem.totalBytes || -1,
                        fileSize: downloadItem.fileSize || 0
                    };
                    
                    // Initialize estimator with current progress
                    if (downloadItem.bytesReceived > 0) {
                        activeDownloads[downloadItem.id].estimator.update(downloadItem.bytesReceived);
                    }
                }
            });
            updateStorage();
        }
    });
}

// Call initialization when extension loads
initializeDownloads();

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId.startsWith('download-')) {
        const downloadId = parseInt(notificationId.replace('download-', ''));
        
        chrome.downloads.search({id: downloadId}, (results) => {
            if (results && results.length > 0) {
                const downloadItem = results[0];
                
                if (buttonIndex === 0) { // Open File
                    chrome.downloads.open(downloadId);
                } else if (buttonIndex === 1) { // Open Folder
                    chrome.downloads.show(downloadId);
                }
            }
        });
    }
});

// Call throttle function periodically
setInterval(throttleDownloads, 2000);

// **Prevent Background Service Worker from Shutting Down**
setInterval(() => {
    console.log(`[KEEP ALIVE] Background script running...`);
}, 30 * 1000); // Runs every 30 seconds

function serializeDownloadsForPopup() {
    const serialized = {};
    
    Object.keys(activeDownloads).forEach(id => {
        const download = activeDownloads[id];
        if (!download) return;
        
        // Create a deep copy with calculated values
        serialized[id] = {
            id: download.id,
            filename: download.filename,
            url: download.url,
            state: download.state,
            mime: download.mime,
            startTime: download.startTime,
            // Pre-calculate values from estimator
            bytesReceived: download.estimator ? download.estimator.bytesReceived : 0,
            totalBytes: download.estimator ? download.estimator.totalBytes : -1,
            formattedSpeed: download.estimator ? download.estimator.getFormattedSpeed() : '0 KB/s',
            estimatedTimeRemaining: download.estimator ? download.estimator.getEstimatedTime() : 'Unknown',
            progress: download.estimator && download.estimator.totalBytes > 0 ? 
                      Math.round((download.estimator.bytesReceived / download.estimator.totalBytes) * 100) : 0
        };
    });
    
    return serialized;
}
