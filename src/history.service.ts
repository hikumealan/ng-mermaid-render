import { Injectable } from '@angular/core';

export interface HistoryEntry {
  timestamp: number;
  code: string;
}

const HISTORY_STORAGE_KEY = 'mermaid-editor-history';
const MAX_HISTORY_ITEMS = 50; // Maximum number of versions to store
const DEBOUNCE_TIME = 2500; // ms to wait after user stops typing to save a version

@Injectable()
export class HistoryService {
  private history: HistoryEntry[] = [];
  private saveTimeout: any;

  constructor() {
    this.loadHistory();
  }

  private loadHistory() {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        this.history = JSON.parse(storedHistory);
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
      this.history = [];
    }
  }

  private saveHistory() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  }

  addVersion(code: string) {
    clearTimeout(this.saveTimeout);
    
    this.saveTimeout = setTimeout(() => {
      const latestEntry = this.getLatestVersion();
      
      // Don't save if the code hasn't changed
      if (latestEntry && latestEntry.code === code) {
        return;
      }
      
      const newEntry: HistoryEntry = {
        timestamp: Date.now(),
        code: code,
      };

      this.history.unshift(newEntry); // Add to the beginning

      // Prune old history items if the list gets too long
      if (this.history.length > MAX_HISTORY_ITEMS) {
        this.history.pop();
      }

      this.saveHistory();
    }, DEBOUNCE_TIME);
  }

  getHistory(): HistoryEntry[] {
    return this.history;
  }

  getLatestVersion(): HistoryEntry | undefined {
    return this.history[0];
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }
}
