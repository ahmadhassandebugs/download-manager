const DEBUG = true; // Set to false to disable logging

function log(...args) {
    if (DEBUG) {
        console.log("[Download Manager]:", ...args);
    }
}
