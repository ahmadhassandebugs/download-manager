const SEND_LOGS_TO_AWS = false; // Set to true when AWS is ready
const RECENT_DOWNLOAD_TIME_LIMIT = 24 * 60 * 60 * 1000; // Keep downloads from today

class DownloadEstimator {
    constructor(downloadId, totalBytes) {
        this.downloadId = downloadId;
        this.totalBytes = totalBytes;
        this.bytesReceived = 0;
        this.startTime = Date.now();
        this.speedHistory = [];
    }

    update(bytesReceived) {
        let now = Date.now();
        let deltaTime = (now - this.startTime) / 1000; // seconds
        let speed = (bytesReceived - this.bytesReceived) / deltaTime; // bytes/sec
        this.speedHistory.push(speed);

        if (this.speedHistory.length > 5) this.speedHistory.shift();

        this.bytesReceived = bytesReceived;
    }

    getEstimatedTime() {
        if (this.speedHistory.length === 0 || this.totalBytes === -1) return null;
        let avgSpeed = this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length;
        return avgSpeed === 0 ? null : (this.totalBytes - this.bytesReceived) / avgSpeed;
    }
}

// Store only today's downloads
let activeDownloads = {};

// Listen for new downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
    let now = Date.now();
    let today = new Date().setHours(0, 0, 0, 0);
    let downloadDate = new Date(downloadItem.startTime);

    // Only track downloads from today
    if (downloadDate.getTime() >= today) {
        activeDownloads[downloadItem.id] = {
            estimator: new DownloadEstimator(downloadItem.id, downloadItem.totalBytes || -1),
            startTime: now,
            state: "in_progress"
        };
        console.log(`[NEW DOWNLOAD] ${downloadItem.filename} started. Download ID: ${downloadItem.id}`);
    } else {
        console.log(`[IGNORED] Old download: ${downloadItem.filename}`);
    }
});

// Update download progress
chrome.downloads.onChanged.addListener((downloadDelta) => {
    let download = activeDownloads[downloadDelta.id];
    if (!download) return;

    if (downloadDelta.bytesReceived) {
        download.estimator.update(downloadDelta.bytesReceived.current);
        console.log(`[PROGRESS] Download ID: ${downloadDelta.id} | Bytes: ${download.estimator.bytesReceived} / ${download.estimator.totalBytes}`);
    }

    if (downloadDelta.state) {
        download.state = downloadDelta.state.current;
        if (download.state === "complete") {
            logDownloadStats(downloadDelta.id, "Completed");
            console.log(`[COMPLETED] Download ID: ${downloadDelta.id}`);
            setTimeout(() => delete activeDownloads[downloadDelta.id], RECENT_DOWNLOAD_TIME_LIMIT);
        }
    }
});

// Log download stats (Instead of sending to AWS)
function logDownloadStats(downloadId, status) {
    let download = activeDownloads[downloadId];
    if (!download) return;

    let logData = {
        userId: localStorage.getItem("userId") || "Anonymous",
        browser: navigator.userAgent,
        os: navigator.platform,
        downloadId: downloadId,
        totalBytes: download.estimator.totalBytes,
        bytesReceived: download.estimator.bytesReceived,
        estimatedTime: download.estimator.getEstimatedTime(),
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

// **Prevent Background Service Worker from Shutting Down**
setInterval(() => {
    console.log(`[KEEP ALIVE] Background script running...`);
}, 30 * 1000); // Runs every 30 seconds
