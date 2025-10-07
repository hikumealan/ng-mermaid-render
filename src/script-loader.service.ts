import { Injectable } from '@angular/core';

@Injectable()
export class ScriptLoaderService {
  private loadedScripts: { [url: string]: Promise<void> } = {};

  loadScript(url: string, globalName?: string): Promise<void> {
    if (this.loadedScripts[url]) {
      return this.loadedScripts[url];
    }

    this.loadedScripts[url] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => {
        if (globalName) {
          this.waitForGlobal(globalName, 50, 100) // Poll for 5 seconds total
            .then(resolve)
            .catch(() => reject(`Global variable ${globalName} did not appear in time.`));
        } else {
          resolve();
        }
      };
      script.onerror = (error) => reject(`Failed to load script: ${url}. Error: ${error}`);
      document.body.appendChild(script);
    });

    return this.loadedScripts[url];
  }

  private waitForGlobal(name: string, intervalMs: number, maxRetries: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let retries = 0;
      const interval = setInterval(() => {
        if ((window as any)[name]) {
          clearInterval(interval);
          resolve();
        } else if (retries++ >= maxRetries) {
          clearInterval(interval);
          reject();
        }
      }, intervalMs);
    });
  }
}