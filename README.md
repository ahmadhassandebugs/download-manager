# Download Manager

A lightweight download manager for better wait time estimation.


## **Functional Requirements**
1. **Download Tracking & UI**
   - Display active downloads with:
     - Progress bar (updated every 1 second) [Done]
     - remaining time, speed  [Done]
   - Show past downloads (completed, canceled, or interrupted) from the same day only.

2. **Download Controls**
   - Pause an active download. [Done]
   - Resume a paused download. [Done]
   - Cancel a download. [Done]

3. **Speed & Time Estimation**
   - Implement an **abstract class** for estimation methods.
   - Support multiple speed/time estimation approaches.
   - Store estimator-generated stats and use them to update the UI.

4. **Data Storage & Transmission**
   - **Generate a CSV file** containing download stats. [Done]
   - Include **session ID and client stats (browser, OS, etc.)** in the CSV.
   - Send the CSV file to **Google Cloud Storage** at the end of each download.

5. **Theming & Responsiveness**
   - Dark UI. [Done]
   - Ensure **UI adjusts to different screen sizes**. [Done]

6. **Randomized Estimator Experiemnt**
   - Implement a **feedback form** to collect user opinions. Get feedback after the method has been used for 1+ days.
   - To evaluate different methods for estimating download completion time, the extension assigns a single estimation method for a fixed period (3 days). After this period, the extension automatically selects a new method at random and applies it for the next cycle. This ensures a fair distribution of methods over time while allowing performance evaluation under diverse conditions.
