const SEND_LOGS_TO_AWS = false; // Set to true when AWS is ready
const RECENT_DOWNLOAD_TIME_LIMIT = 10 * 60 * 1000; // 10 minutes

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

// Store only downloads created in this session
let activeDownloads = {};

// Listen for new downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
    activeDownloads[downloadItem.id] = {
        estimator: new DownloadEstimator(downloadItem.id, downloadItem.totalBytes || -1),
        startTime: Date.now(), // Store creation time
        state: "in_progress"
    };
});

// Update download progress
chrome.downloads.onChanged.addListener((downloadDelta) => {
    let download = activeDownloads[downloadDelta.id];
    if (!download) return;

    if (downloadDelta.bytesReceived) {
        download.estimator.update(downloadDelta.bytesReceived.current);
    }

    if (downloadDelta.state) {
        download.state = downloadDelta.state.current;
        if (download.state === "complete") {
            logDownloadStats(downloadDelta.id, "Completed");
        }
    }

    updatePopup();
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
        console.log("[LOG]", logData);
    }
}
