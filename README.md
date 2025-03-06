# Download Manager

A lightweight download manager for better wait time estimation.


## **Functional Requirements**
1. **Download Tracking & UI**
   - Display active downloads with:
     - Progress bar (updated every 500ms)
     - Downloaded size, total size, elapsed time, remaining time, speed
   - Show past downloads (completed, canceled, or interrupted) from the same day only.

2. **Download Controls**
   - Pause an active download.
   - Resume a paused download.
   - Cancel a download.

3. **Speed & Time Estimation**
   - Implement an **abstract class** for estimation methods.
   - Support multiple speed/time estimation approaches.
   - Store estimator-generated stats and use them to update the UI.

4. **Data Storage & Transmission**
   - **Generate a CSV file** containing download stats.
   - **Temporarily store** stats using **WebExtensions API & IndexedDB**.
   - Send the CSV file to **Google Cloud Storage** at the end of each download.
   - Include **session ID and client stats (browser, OS, etc.)** in the CSV.

5. **Theming & Responsiveness**
   - Support **light and dark modes**.
   - Ensure **UI adjusts to different screen sizes**.

6. **Logging & Debugging**
   - **Console logging only** (no external analytics or logging tools).

---

## **Finalized Technology Stack**

### **Frontend & UI**
- **HTML, CSS, JavaScript (Vanilla or React)**
- **Tailwind CSS** (for theming and responsiveness)
- **WebExtensions API** (cross-browser compatibility)
- **chrome.downloads API** (for Chrome)
- **browser.downloads API** (for Firefox)
- **Custom JavaScript Estimator Class** (for speed/time calculations, updating UI)

### **CSV Handling & Storage**
- **Custom JavaScript function** for CSV generation.
- **IndexedDB (via WebExtensions API)** for temporary storage before upload.
- **Google Cloud Storage** (for storing CSV files).
- **Google Cloud Signed URLs** (for simple and free uploads).

### **Logging & Debugging**
- **Console logging only**.
