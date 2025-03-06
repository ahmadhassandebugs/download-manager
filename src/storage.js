const DB_NAME = "DownloadManagerDB";
const DB_VERSION = 1;
const STORE_NAME = "active_downloads";

// Open or create the database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
            let db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "entryId" }); // Unique key for each entry
            }
        };

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            reject("IndexedDB Error: " + event.target.errorCode);
        };
    });
}

// Save or update an active download entry with a counter
async function saveActiveDownload(download) {
    let db = await openDatabase();
    return new Promise((resolve, reject) => {
        let transaction = db.transaction(STORE_NAME, "readwrite");
        let store = transaction.objectStore(STORE_NAME);

        const countRequest = store.getAll();
        countRequest.onsuccess = function () {
            const count = countRequest.result.filter(entry => entry.id === download.id).length;
            const entryId = `${download.id}-${count}`; // Unique key combining downloadId and counter

            let request = store.put({ ...download, entryId });
            request.onsuccess = function () {
                resolve(count + 1); // Increment counter for next use
            };
            request.onerror = function (event) {
                reject("IndexedDB put() Error: " + event.target.error);
            };
        };

        countRequest.onerror = function (event) {
            reject("IndexedDB getAll() Error: " + event.target.error);
        };
    });
}

// Retrieve all stats for a given downloadId
async function getDownloadStats(downloadId) {
    let db = await openDatabase();
    return new Promise((resolve, reject) => {
        let transaction = db.transaction(STORE_NAME, "readonly");
        let store = transaction.objectStore(STORE_NAME);
        let request = store.getAll();

        request.onsuccess = function () {
            const results = request.result.filter(entry => entry.id === downloadId);
            resolve(results);
        };

        request.onerror = function () {
            reject("Failed to retrieve download stats.");
        };
    });
}

// Delete all stats for a completed download
async function deleteDownloadStats(downloadId) {
    let db = await openDatabase();
    let transaction = db.transaction(STORE_NAME, "readwrite");
    let store = transaction.objectStore(STORE_NAME);

    let request = store.getAll();

    request.onsuccess = function () {
        request.result
            .filter(entry => entry.id === downloadId)
            .forEach(entry => store.delete(entry.entryId));
    };
}
