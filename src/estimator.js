class DownloadEstimator {
    constructor() {
        this.previousStats = {}; // Stores last known stats per download ID
    }

    /**
     * Calculates speed and remaining time for a given download.
     * @param {Object} download - Download object from chrome.downloads.search
     * @returns {Object} - Contains speed, remaining time, and estimator type
     */
    calculate(download) {
        const downloadId = download.id;
        const now = Date.now();

        // Convert time format to ISO for consistency
        const currentTimeISO = new Date(now).toISOString();
        const startTimeISO = new Date(download.startTime).toISOString();

        // Get previous stats
        const prev = this.previousStats[downloadId] || {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };

        // Calculate speed (bytes per second)
        const elapsedTime = (now - prev.timestamp) / 1000; // Convert ms to seconds
        const bytesDownloaded = download.bytesReceived - prev.receivedBytes;
        const speed = elapsedTime > 0 ? (bytesDownloaded / elapsedTime) : 0;

        // Calculate remaining time (seconds)
        const remainingBytes = download.totalBytes - download.bytesReceived;
        const remainingTime = speed > 0 ? (remainingBytes / speed) : -1; // -1 if unknown

        // Store new stats for future calculations
        this.previousStats[downloadId] = {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };

        return {
            speed: speed.toFixed(2), // Mbps or KBps can be derived later
            remainingTime: remainingTime > 0 ? remainingTime.toFixed(2) : "Unknown",
            estimatorType: "instantaneous",
            startTime: startTimeISO,
            currentTime: currentTimeISO,
        };
    }
}

// Export singleton instance
const estimator = new DownloadEstimator();
