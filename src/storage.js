/**
 * Storage utility for cross-browser extension development
 */
const StorageUtil = {
    /**
     * Sets one or multiple items in storage
     * 
     * @param {Object} data - Key-value pairs to store
     * @returns {Promise} Promise that resolves when data is stored
     */
    set(data) {
      return new Promise((resolve, reject) => {
        try {
          if (typeof browser !== 'undefined') {
            browser.storage.local.set(data).then(resolve).catch(reject);
          } else {
            chrome.storage.local.set(data, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    },
    
    /**
     * Gets one or multiple items from storage
     * 
     * @param {string|Array|Object} keys - Key(s) to retrieve
     * @returns {Promise<Object>} Promise that resolves with retrieved data
     */
    get(keys) {
      return new Promise((resolve, reject) => {
        try {
          if (typeof browser !== 'undefined') {
            browser.storage.local.get(keys).then(resolve).catch(reject);
          } else {
            chrome.storage.local.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(result);
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    },
    
    /**
     * Gets a specific value by key, returns null if not found
     * 
     * @param {string} key - The key to retrieve
     * @returns {Promise<any|null>} Promise that resolves with the value or null
     */
    async getValue(key) {
      try {
        const result = await this.get(key);
        return result[key] || null;
      } catch (error) {
        console.error(`Error retrieving ${key}:`, error);
        return null;
      }
    },
    
    /**
     * Sets a specific key-value pair
     * 
     * @param {string} key - Key to store
     * @param {any} value - Value to store
     * @returns {Promise} Promise that resolves when data is stored
     */
    setValue(key, value) {
      const data = {};
      data[key] = value;
      return this.set(data);
    },
    
    /**
     * Removes one or more items from storage
     * 
     * @param {string|Array} keys - Key(s) to remove
     * @returns {Promise} Promise that resolves when items are removed
     */
    remove(keys) {
      return new Promise((resolve, reject) => {
        try {
          if (typeof browser !== 'undefined') {
            browser.storage.local.remove(keys).then(resolve).catch(reject);
          } else {
            chrome.storage.local.remove(keys, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    },
    
    /**
     * Clears all storage
     * 
     * @returns {Promise} Promise that resolves when storage is cleared
     */
    clear() {
      return new Promise((resolve, reject) => {
        try {
          if (typeof browser !== 'undefined') {
            browser.storage.local.clear().then(resolve).catch(reject);
          } else {
            chrome.storage.local.clear(() => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve();
              }
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    }
};
