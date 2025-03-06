document.addEventListener('DOMContentLoaded', () => {
    
    console.log("Popup opened - requesting initial download refresh");

    // Initial refresh to sync with background state
    chrome.runtime.sendMessage({action: 'refreshDownloads'}, response => {
        console.log("Initial refresh complete:", response);
        // Continue with normal loading after refresh
        loadActiveDownloads();
    });

    // To ensure auto-updates
    setupAutoRefresh();

    // Tab navigation
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.id.replace('tab-', '');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show selected content
            tabContents.forEach(content => {
                content.style.display = 'none'; // Use style.display instead of classList
                if (content.id === targetId) {
                    content.style.display = 'block';
                }
            });
            
            // Load data for the selected tab
            if (targetId === 'active-downloads') {
                loadActiveDownloads();
            } else if (targetId === 'download-history') {
                loadDownloadHistory();
            } else if (targetId === 'settings') {
                loadSettings();
            }
        });
    });
    
    // History actions
    document.getElementById('clear-history').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all download history?')) {
            chrome.runtime.sendMessage({action: 'clearHistory'}, response => {
                if (response && response.success) loadDownloadHistory();
            });
        }
    });
    
    document.getElementById('search-history').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterHistory(searchTerm);
    });
    
    // Speed limit settings
    const speedSlider = document.getElementById('speed-limit-slider');
    const speedValue = document.getElementById('speed-limit-value');
    
    speedSlider.addEventListener('input', () => {
        const value = parseInt(speedSlider.value);
        updateSpeedLimitDisplay(value);
    });
    
    speedSlider.addEventListener('change', () => {
        const value = parseInt(speedSlider.value);
        setSpeedLimit(value);
    });
    
    document.querySelectorAll('.limit-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = parseInt(option.dataset.value);
            speedSlider.value = value;
            setSpeedLimit(value);
            updateSpeedLimitDisplay(value);
        });
    });
    
    // Add listener for data updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Popup received message:", message);
        
        if (message && message.action === "dataUpdated") {
            console.log("Received data update notification at", new Date(message.timestamp).toLocaleTimeString());
            
            // Check which tab is active and update accordingly
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const tabId = activeTab.id;
                if (tabId === 'tab-active-downloads') {
                    loadActiveDownloads();
                } else if (tabId === 'tab-download-history') {
                    loadDownloadHistory();
                }
            } else {
                // Default to updating active downloads if no tab is marked active
                loadActiveDownloads();
            }
        }
        return true; // Keep the message channel open
    });
});

function loadActiveDownloads() {
    const container = document.getElementById('active-downloads-container');
    if (!container) {
        console.log("Container 'active-downloads' not found!");
        return;
    }
    
    // Clear any existing refresh timer
    if (window.refreshTimer) {
        clearTimeout(window.refreshTimer);
        window.refreshTimer = null;
    }
    
    chrome.runtime.sendMessage({action: 'getActiveDownloads'}, response => {
        console.log("Received downloads response:", response);
        
        // Check if we got a proper response
        if (!response || !response.downloads) {
            console.error("Invalid response from background script");
            container.innerHTML = '<div class="empty-message">Error loading downloads. <button id="force-refresh" class="btn">Refresh</button></div>';
            
            const refreshBtn = document.getElementById('force-refresh');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    chrome.runtime.sendMessage({action: 'refreshDownloads'}, () => {
                        loadActiveDownloads();
                    });
                });
            }
            return;
        }
        
        const downloads = response.downloads || {};
        const downloadIds = Object.keys(downloads);
        
        if (downloadIds.length === 0) {
            container.innerHTML = '<div class="empty-message">No active downloads <button id="force-refresh" class="btn">Refresh</button></div>';
            document.getElementById('force-refresh').addEventListener('click', () => {
                chrome.runtime.sendMessage({action: 'refreshDownloads'}, response => {
                    loadActiveDownloads();
                });
            });
            return;
        }
        
        container.innerHTML = '';
        
        downloadIds.forEach(id => {
            const download = downloads[id];
            // Skip completed or invalid downloads
            if (!download || download.state === 'complete') return;
            
            try {
                // Handle case where estimator might be missing
                if (!download.estimator) {
                    console.warn("Download missing estimator:", download);
                    return;
                }
                
                const progress = download.estimator.totalBytes > 0 
                    ? Math.round((download.estimator.bytesReceived / download.estimator.totalBytes) * 100) 
                    : 0;
                
                const filename = download.filename ? download.filename.split('/').pop() : 'Unknown file';
                
                const downloadEl = document.createElement('div');
                downloadEl.className = 'download-item';
                downloadEl.innerHTML = `
                    <div class="download-title">${filename}</div>
                    <div class="download-progress">
                        <div class="download-progress-bar" style="width: ${download.progress || 0}%"></div>
                    </div>
                    <div class="download-details">
                        <span>${formatFileSize(download.bytesReceived)} of ${formatFileSize(download.totalBytes)}</span>
                        <span>${download.formattedSpeed || '0 B/s'}</span>
                    </div>
                    <div class="download-details">
                        <span>${download.progress || 0}%</span>
                        <span>${download.estimatedTimeRemaining || 'Unknown'} remaining</span>
                    </div>
                    <div class="download-actions">
                        ${getDownloadActionButtons(id, download.state)}
                    </div>
                `;
                container.appendChild(downloadEl);
                
                // Add event listeners for action buttons
                const actionButtons = downloadEl.querySelectorAll('.download-action');
                actionButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const action = button.dataset.action;
                        const downloadId = parseInt(button.dataset.id);

                        console.log(`[ACTION] Performing ${action} on download ${downloadId}`);
                        
                        if (action === 'pause') {
                            chrome.downloads.pause(downloadId, () => {
                                if (chrome.runtime.lastError) {
                                    console.error('Error pausing download:', chrome.runtime.lastError);
                                } else {
                                    console.log(`Download ${downloadId} paused successfully`);
                                }
                                // Force a refresh of the UI
                                chrome.runtime.sendMessage({action: 'refreshDownloads'}, () => {
                                    setTimeout(loadActiveDownloads, 100);
                                });
                            });
                        } else if (action === 'resume') {
                            chrome.downloads.resume(downloadId, () => {
                                if (chrome.runtime.lastError) {
                                    console.error('Error resuming download:', chrome.runtime.lastError);
                                } else {
                                    console.log(`Download ${downloadId} resumed successfully`);
                                }
                                // Force a refresh of the UI
                                chrome.runtime.sendMessage({action: 'refreshDownloads'}, () => {
                                    setTimeout(loadActiveDownloads, 100);
                                });
                            });
                        } else if (action === 'cancel') {
                            chrome.downloads.cancel(downloadId, () => {
                                if (chrome.runtime.lastError) {
                                    console.error('Error canceling download:', chrome.runtime.lastError);
                                } else {
                                    console.log(`Download ${downloadId} canceled successfully`);
                                }
                                // Force a refresh of the UI
                                chrome.runtime.sendMessage({action: 'refreshDownloads'}, () => {
                                    setTimeout(loadActiveDownloads, 100);
                                });
                            });
                        }
                    });
                });
            } catch (err) {
                console.error(`Error processing download ${id}:`, err, download);
            }
        });
        
        // Set up refresh timer - store it in window to prevent multiple timers
        window.refreshTimer = setTimeout(loadActiveDownloads, 1000);
    });
}

function loadDownloadHistory() {
    const container = document.getElementById('download-history');
    if (!container) {
        console.error("Container 'download-history' not found!");
        return;
    }
    
    chrome.runtime.sendMessage({action: 'getHistory'}, response => {
        console.log("Received history response:", response);
        const history = response && response.history ? response.history : [];
        
        if (history.length === 0) {
            container.innerHTML = '<div class="empty-message">No download history</div>';
            return;
        }
        
        container.innerHTML = '';
        
        history.forEach(item => {
            const historyEl = document.createElement('div');
            historyEl.className = 'history-item';
            historyEl.dataset.url = item.url || '';
            historyEl.innerHTML = `
                <div class="history-title">${item.filename || 'Unknown file'}</div>
                <div class="history-details">
                    <div>${formatFileSize(item.fileSize)}</div>
                    <div>${formatDate(item.endTime)}</div>
                    <div>${item.status || 'Completed'}</div>
                </div>
            `;
            container.appendChild(historyEl);
            
            // Add click event to re-download
            historyEl.addEventListener('click', () => {
                if (item.url) {
                    chrome.downloads.download({
                        url: item.url,
                        conflictAction: 'uniquify'
                    });
                }
            });
        });
    });
}

function setupAutoRefresh() {
    console.log("Setting up auto refresh");
    // Clear any existing timer
    if (window.refreshTimer) {
        clearTimeout(window.refreshTimer);
    }
    
    // Start a new periodic refresh
    function refreshLoop() {
        loadActiveDownloads();
        window.refreshTimer = setTimeout(refreshLoop, 1000);
    }
    
    // Start the refresh loop
    refreshLoop();
}

function loadSettings() {
    chrome.storage.local.get('speedLimit', (result) => {
        const speedLimit = result.speedLimit || 0;
        document.getElementById('speed-limit-slider').value = speedLimit;
        updateSpeedLimitDisplay(speedLimit);
    });
}

function filterHistory(searchTerm) {
    const items = document.querySelectorAll('.history-item');
    
    items.forEach(item => {
        const title = item.querySelector('.history-title').textContent.toLowerCase();
        if (title.includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function updateSpeedLimitDisplay(value) {
    const speedValue = document.getElementById('speed-limit-value');
    
    if (value === 0) {
        speedValue.textContent = 'No limit';
    } else {
        speedValue.textContent = `${value} MB/s`;
    }
}

function setSpeedLimit(value) {
    // Convert MB/s to bytes/s
    const bytesPerSec = value * 1024 * 1024;
    
    chrome.runtime.sendMessage({
        action: 'setSpeedLimit',
        limit: bytesPerSec
    });
}

function getDownloadActionButtons(id, state) {
    if (state === 'in_progress') {
        return `
            <button class="btn download-action" data-action="pause" data-id="${id}">Pause</button>
            <button class="btn danger download-action" data-action="cancel" data-id="${id}">Cancel</button>
        `;
    } else if (state === 'paused') {
        return `
            <button class="btn download-action" data-action="resume" data-id="${id}">Resume</button>
            <button class="btn danger download-action" data-action="cancel" data-id="${id}">Cancel</button>
        `;
    }
    return '';
}

function formatFileSize(bytes) {
    if (bytes === undefined || bytes === null || bytes === -1) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024 * 10) / 10 + ' KB';
    if (bytes < 1024 * 1024 * 1024) return Math.round(bytes / (1024 * 1024) * 10) / 10 + ' MB';
    return Math.round(bytes / (1024 * 1024 * 1024) * 10) / 10 + ' GB';
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
        return 'Unknown date';
    }
}
