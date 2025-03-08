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

class MovingAverageEstimator {
    constructor(windowSize = 5) {
        this.previousStats = {};  // Per download ID
        this.speedHistory = {};   // Store speed samples per download
        this.windowSize = windowSize;
    }
    
    calculate(download) {
        const downloadId = download.id;
        const now = Date.now();
        
        // Initialize history array if needed
        if (!this.speedHistory[downloadId]) {
            this.speedHistory[downloadId] = [];
        }
        
        // Get previous stats
        const prev = this.previousStats[downloadId] || {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate instant speed
        const elapsedTime = (now - prev.timestamp) / 1000;
        const bytesDownloaded = download.bytesReceived - prev.receivedBytes;
        const instantSpeed = elapsedTime > 0 ? (bytesDownloaded / elapsedTime) : 0;
        
        // Add to history
        this.speedHistory[downloadId].push(instantSpeed);
        
        // Keep only the most recent window size elements
        if (this.speedHistory[downloadId].length > this.windowSize) {
            this.speedHistory[downloadId].shift();
        }
        
        // Calculate average speed
        const avgSpeed = this.speedHistory[downloadId].reduce((sum, speed) => sum + speed, 0) / 
            this.speedHistory[downloadId].length;
        
        // Update stats for next calculation
        this.previousStats[downloadId] = {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate remaining time using average speed
        const remainingBytes = download.totalBytes - download.bytesReceived;
        const remainingTime = avgSpeed > 0 ? (remainingBytes / avgSpeed) : -1;
        
        return {
            speed: avgSpeed.toFixed(2),
            remainingTime: remainingTime > 0 ? remainingTime.toFixed(2) : "Unknown",
            estimatorType: "movingAverage",
            startTime: new Date(download.startTime).toISOString(),
            currentTime: new Date(now).toISOString(),
        };
    }
}

class ExponentialSmoothingEstimator {
    constructor(alpha = 0.2) { // Alpha: smoothing factor (0-1)
        this.previousStats = {};  // Per download ID
        this.averageSpeeds = {};  // Store EMA per download
        this.alpha = alpha;
    }
    
    calculate(download) {
        const downloadId = download.id;
        const now = Date.now();
        
        // Get previous stats
        const prev = this.previousStats[downloadId] || {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate instant speed
        const elapsedTime = (now - prev.timestamp) / 1000;
        const bytesDownloaded = download.bytesReceived - prev.receivedBytes;
        const instantSpeed = elapsedTime > 0 ? (bytesDownloaded / elapsedTime) : 0;
        
        // Calculate EMA
        if (this.averageSpeeds[downloadId] === undefined) {
            // First measurement
            this.averageSpeeds[downloadId] = instantSpeed;
        } else {
            // EMA formula: newEMA = alpha * currentValue + (1-alpha) * previousEMA
            this.averageSpeeds[downloadId] = (this.alpha * instantSpeed) + 
                ((1 - this.alpha) * this.averageSpeeds[downloadId]);
        }
        
        // Update stats for next calculation
        this.previousStats[downloadId] = {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate remaining time using EMA
        const remainingBytes = download.totalBytes - download.bytesReceived;
        const remainingTime = this.averageSpeeds[downloadId] > 0 ? 
            (remainingBytes / this.averageSpeeds[downloadId]) : -1;
        
        return {
            speed: this.averageSpeeds[downloadId].toFixed(2),
            remainingTime: remainingTime > 0 ? remainingTime.toFixed(2) : "Unknown",
            estimatorType: "exponentialSmoothing",
            startTime: new Date(download.startTime).toISOString(),
            currentTime: new Date(now).toISOString(),
        };
    }
}

class KalmanFilterEstimator {
    constructor(processNoise = 0.01, measurementNoise = 0.1) {
        this.previousStats = {};    // Per download ID
        this.kalmanState = {};      // Store Kalman state per download
        this.processNoise = processNoise;          // Q: Process noise
        this.measurementNoise = measurementNoise;  // R: Measurement noise
    }
    
    calculate(download) {
        const downloadId = download.id;
        const now = Date.now();
        
        // Get previous stats
        const prev = this.previousStats[downloadId] || {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate instant speed (measurement)
        const elapsedTime = (now - prev.timestamp) / 1000;
        const bytesDownloaded = download.bytesReceived - prev.receivedBytes;
        const instantSpeed = elapsedTime > 0 ? (bytesDownloaded / elapsedTime) : 0;
        
        // Initialize Kalman state if needed
        if (!this.kalmanState[downloadId]) {
            this.kalmanState[downloadId] = {
                x: instantSpeed,    // Initial state estimate (speed)
                p: 1.0              // Initial estimate uncertainty
            };
        }
        
        // Kalman filter prediction step
        // For simplicity, we assume the state doesn't change in the prediction
        // p = p + Q (prediction uncertainty increases by the process noise)
        this.kalmanState[downloadId].p = this.kalmanState[downloadId].p + this.processNoise;
        
        // Kalman filter update step
        // Calculate the Kalman gain: k = p / (p + R)
        const k = this.kalmanState[downloadId].p / 
                 (this.kalmanState[downloadId].p + this.measurementNoise);
        
        // Update the state estimate: x = x + k * (measurement - x)
        this.kalmanState[downloadId].x = this.kalmanState[downloadId].x + 
                                        k * (instantSpeed - this.kalmanState[downloadId].x);
        
        // Update the uncertainty: p = (1 - k) * p
        this.kalmanState[downloadId].p = (1 - k) * this.kalmanState[downloadId].p;
        
        // Store current stats for next calculation
        this.previousStats[downloadId] = {
            receivedBytes: download.bytesReceived,
            timestamp: now,
        };
        
        // Calculate remaining time using filtered speed
        const filteredSpeed = this.kalmanState[downloadId].x;
        const remainingBytes = download.totalBytes - download.bytesReceived;
        const remainingTime = filteredSpeed > 0 ? (remainingBytes / filteredSpeed) : -1;
        
        return {
            speed: filteredSpeed.toFixed(2),
            remainingTime: remainingTime > 0 ? remainingTime.toFixed(2) : "Unknown",
            estimatorType: "kalmanFilter",
            startTime: new Date(download.startTime).toISOString(),
            currentTime: new Date(now).toISOString(),
        };
    }
}

// Export singleton instance
const estimator = new ExponentialSmoothingEstimator();
