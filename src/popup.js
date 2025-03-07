const UI_UPDATE_INTERVAL = 1000; // Update UI every second

// Keep track of downloads locally in the popup
let activeDownloads = {};

document.addEventListener("DOMContentLoaded", function() {
    const downloadsList = document.getElementById("downloads-list");
    
    // Initial fetch of active downloads
    fetchActiveDownloads();
    
    // Setup message listeners for real-time updates
    setupMessageListeners();
    
    // Setup periodic UI refresh - only for progress, speed and ETA
    setInterval(updateDynamicElements, UI_UPDATE_INTERVAL);
    
    function fetchActiveDownloads() {
        log("Requesting active downloads from background script");
        chrome.runtime.sendMessage({ action: "getActiveDownloads" }, response => {
            if (response && response.success) {
                log(`Received ${response.downloads.length} active downloads`);
                
                // Update our local copy of downloads
                activeDownloads = {};
                response.downloads.forEach(download => {
                    activeDownloads[download.id] = download;
                    log(`Added download: ${download.id} - ${download.filename}`);
                });
                
                // Initial render of the UI
                renderDownloadsList();
            } else {
                log("Failed to fetch active downloads", response);
                downloadsList.innerHTML = `
                <div class="p-4 bg-red-800/20 border border-red-700 rounded-lg">
                    <p class="text-red-400">Error fetching downloads</p>
                    <p class="text-xs text-gray-400 mt-1">Please check the browser console for details.</p>
                </div>`;
            }
        });
    }
    
    // Initial render of the download list
    function renderDownloadsList() {
        // Clear the list
        downloadsList.innerHTML = "";
        
        // Get all download IDs
        const downloadIds = Object.keys(activeDownloads);
        
        if (downloadIds.length === 0) {
            downloadsList.innerHTML = `
                <div class="flex items-center justify-center p-8 rounded-lg bg-gray-800/50 border border-gray-700">
                    <div class="text-center">
                        <svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <p class="text-gray-400">No active downloads</p>
                    </div>
                </div>`;
            return;
        }
        
        // Create elements for each download
        downloadIds.forEach(id => {
            const download = activeDownloads[id];
            if (!download) return;
            
            createDownloadItem(download);
        });
        
        // Add event listeners to the new buttons
        addEventListeners();
    }
    
    // Create a single download item element
    function createDownloadItem(download) {
        const id = download.id;
        const progress = download.progress || 0;
        const formattedSpeed = formatSpeed(parseFloat(download.speed) || 0);
        const formattedTime = download.remainingTime !== "Unknown" ? 
            formatTime(parseFloat(download.remainingTime)) : "Unknown";
        const basename = download.filename || "Unknown file";
        const isPaused = download.state === "paused";
        
        // Determine progress color based on status
        let progressColorClass = 'bg-blue-500';
        if (isPaused) progressColorClass = 'bg-amber-500';
        
        const item = document.createElement("div");
        item.classList.add("download-item", "bg-gray-800", "rounded-lg", "p-4", "border", "border-gray-700", "shadow");
        item.setAttribute("data-id", id);
        item.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <h3 class="text-sm font-medium text-gray-200 truncate max-w-[70%]" title="${basename}">${basename}</h3>
                <span class="progress-percentage text-sm font-medium text-blue-400">${progress}%</span>
            </div>
            
            <div class="relative w-full h-2.5 bg-gray-700 rounded-full mb-3 overflow-hidden">
                <div class="progress-bar absolute top-0 left-0 h-full ${progressColorClass} transition-all duration-300 rounded-full" style="width: ${progress}%"></div>
            </div>
            
            <div class="flex justify-between items-center text-xs text-gray-400 mb-3">
                <span class="download-speed flex items-center">
                    <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11 3v17.6l-9.4-9.4 1.4-1.4 8 8 8-8 1.4 1.4L11 20.6z"></path>
                    </svg>
                    ${formattedSpeed}
                </span>
                <span class="download-eta flex items-center">
                    <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path>
                    </svg>
                    ${formattedTime}
                </span>
            </div>
            
            <div class="flex gap-2 justify-end">
                <button class="pause-resume text-xs px-3 py-1.5 rounded-md ${isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'} text-white transition-colors" data-id="${id}">
                    ${isPaused ? 
                        '<span class="flex items-center"><svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg> Resume</span>' : 
                        '<span class="flex items-center"><svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg> Pause</span>'
                    }
                </button>
                <button class="cancel text-xs px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors" data-id="${id}">
                    <span class="flex items-center"><svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg> Cancel</span>
                </button>
            </div>
        `;
        
        downloadsList.appendChild(item);
    }
    
    // Update only the dynamic elements (progress, speed, ETA) without recreating the DOM
    function updateDynamicElements() {
        for (const id in activeDownloads) {
            const download = activeDownloads[id];
            const downloadElement = document.querySelector(`.download-item[data-id="${id}"]`);
            
            if (!downloadElement) {
                continue; // Skip if element not found
            }
            
            const progress = download.progress || 0;
            const formattedSpeed = formatSpeed(parseFloat(download.speed) || 0);
            const formattedTime = download.remainingTime !== "Unknown" ? 
                formatTime(parseFloat(download.remainingTime)) : "Unknown";
                
            // Update progress percentage
            const progressPercentage = downloadElement.querySelector('.progress-percentage');
            if (progressPercentage) {
                progressPercentage.textContent = `${progress}%`;
            }
            
            // Update progress bar width
            const progressBar = downloadElement.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            // Update speed
            const speedElement = downloadElement.querySelector('.download-speed');
            if (speedElement) {
                speedElement.innerHTML = `
                    <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11 3v17.6l-9.4-9.4 1.4-1.4 8 8 8-8 1.4 1.4L11 20.6z"></path>
                    </svg>
                    ${formattedSpeed}
                `;
            }
            
            // Update ETA
            const etaElement = downloadElement.querySelector('.download-eta');
            if (etaElement) {
                etaElement.innerHTML = `
                    <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path>
                    </svg>
                    ${formattedTime}
                `;
            }
        }
    }
    
    function setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message) => {
            log("Received message:", message.type);
            
            switch (message.type) {
                case "NEW_DOWNLOAD":
                // Handle new download
                if (message.data && message.data.id) {
                    log(`New download started: ${message.data.id}`);
                    activeDownloads[message.data.id] = message.data;
                    renderDownloadsList();
                }
                break;
                case "DOWNLOAD_PROGRESS_UPDATE":
                    // Update a specific download's progress
                    const data = message.data;
                    if (data && data.id) {
                        log(`Progress update for download ${data.id}: ${data.progress}%`);
                        const download = activeDownloads[data.id] || {};
                        const hadUnknownFilename = !download.filename || download.filename === "Unknown file";
                        const gotRealFilename = data.filename && data.filename !== "Unknown file";
                        
                        // Update only provided properties
                        activeDownloads[data.id] = {
                            ...download,
                            ...data
                        };
                        
                        // If we previously had an unknown filename but now got a real one,
                        // we need to re-render the whole item to update the filename display
                        if (hadUnknownFilename && gotRealFilename) {
                            log(`Updated filename for download ${data.id}: ${data.filename}`);
                            renderDownloadsList();
                        } else {
                            // Otherwise just update dynamic elements
                            updateDynamicElements();
                        }
                    }
                    break;
                    
                case "DOWNLOAD_STATE_CHANGE":
                    // Update a download's state (paused/resumed)
                    if (message.data && message.data.id) {
                        if (activeDownloads[message.data.id]) {
                            activeDownloads[message.data.id].state = message.data.state;
                            
                            // Update the entire UI since we need to change the button appearance
                            renderDownloadsList();
                        }
                    }
                    break;
                    
                case "DOWNLOAD_COMPLETED":
                case "DOWNLOAD_CANCELED":
                case "DOWNLOAD_FAILED":
                    // Remove the download from active list
                    if (message.data && message.data.id) {
                        const id = message.data.id;
                        log(`Download ${message.type.toLowerCase()}: ${id}`);
                        
                        // Remove the download item from DOM
                        const downloadElement = document.querySelector(`.download-item[data-id="${id}"]`);
                        if (downloadElement) {
                            downloadElement.classList.add('fade-out');
                            setTimeout(() => {
                                delete activeDownloads[id];
                                renderDownloadsList();
                            }, 300);
                        } else {
                            delete activeDownloads[id];
                            renderDownloadsList();
                        }
                    }
                    break;
                    
                default:
                    // Unknown message type
                    break;
            }
        });
    }
        
    function addEventListeners() {
        // Pause/Resume buttons
        document.querySelectorAll(".pause-resume").forEach((button) => {
            button.addEventListener("click", function() {
                const downloadId = parseInt(this.getAttribute("data-id"));
                log(`Pause/Resume button clicked for Download ID: ${downloadId}`);
                
                if (!activeDownloads[downloadId]) {
                    log(`Download ${downloadId} not found`);
                    return;
                }
                
                const isPaused = activeDownloads[downloadId].state === "paused";
                
                if (isPaused) {
                    // Resume download
                    log(`Resuming download: ${downloadId}`);
                    chrome.runtime.sendMessage({ 
                        action: "resumeDownload", 
                        downloadId: downloadId 
                    }, response => {
                        if (response && response.success) {
                            activeDownloads[downloadId].state = "in_progress";
                            renderDownloadsList(); // Changed from updateUI
                        } else {
                            log("Failed to resume download");
                        }
                    });
                } else {
                    // Pause download
                    log(`Pausing download: ${downloadId}`);
                    chrome.runtime.sendMessage({ 
                        action: "pauseDownload", 
                        downloadId: downloadId 
                    }, response => {
                        if (response && response.success) {
                            activeDownloads[downloadId].state = "paused";
                            renderDownloadsList(); // Changed from updateUI
                        } else {
                            log("Failed to pause download");
                        }
                    });
                }
            });
        });
        
        // Cancel buttons
        document.querySelectorAll(".cancel").forEach((button) => {
            button.addEventListener("click", function() {
                const downloadId = parseInt(this.getAttribute("data-id"));
                log(`Cancel button clicked for Download ID: ${downloadId}`);
                
                chrome.runtime.sendMessage({ 
                    action: "cancelDownload", 
                    downloadId: downloadId 
                }, response => {
                    if (response && response.success) {
                        delete activeDownloads[downloadId];
                        renderDownloadsList(); // Changed from updateUI
                    } else {
                        log("Failed to cancel download");
                    }
                });
            });
        });
    }

    // Add refresh button functionality
    document.getElementById('refresh-btn').addEventListener('click', () => {
        log("Manually refreshing downloads list");
        fetchActiveDownloads();
    });
});

function formatSpeed(bytesPerSecond) {
    // Convert bytes to bits (1 byte = 8 bits)
    const bitsPerSecond = bytesPerSecond * 8;
    
    if (isNaN(bitsPerSecond) || bitsPerSecond === 0) return "0.00 b/s  ";
    
    if (bitsPerSecond < 1000) {
        return bitsPerSecond.toFixed(2) + " b/s  ";
    }
    
    if (bitsPerSecond < 1000000) {
        return (bitsPerSecond / 1000).toFixed(2) + " Kb/s ";
    }
    
    if (bitsPerSecond < 1000000000) {
        return (bitsPerSecond / 1000000).toFixed(2) + " Mb/s ";
    }
    
    return (bitsPerSecond / 1000000000).toFixed(2) + " Gb/s ";
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return "Unknown   ";
    
    if (seconds < 60) {
        // Pad with spaces to maintain consistent width
        const formatted = seconds.toFixed(0) + " sec";
        return formatted.padEnd(9, " ");
    }
    
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')} min`;
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, '0')} hr `;
}

const DEBUG = true;
function log(...args) {
    if (DEBUG) {
        console.log("[Popup]", ...args);
    }
}
