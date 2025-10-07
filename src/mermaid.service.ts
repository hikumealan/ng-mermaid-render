import { Injectable, inject, WritableSignal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare const mermaid: any;

export interface MermaidValidationError {
  message: string;
  lineNumber: number;
}

@Injectable()
export class MermaidService {
  private readonly sanitizer = inject(DomSanitizer);
  private isInitialized = false;
  private highlightCallback: ((lineNumber: number) => void) | null = null;
  // This map will hold the relationship between a diagram node's ID and its line number in the editor.
  private nodeIdToLineNumberMap = new Map<string, number>();
  
  initialize(
    themeSignal: WritableSignal<string>, 
    getHighlightCallback: () => (lineNumber: number) => void
  ) {
    if (typeof mermaid === 'undefined') {
      console.error('Mermaid.js library not loaded.');
      return;
    }
    
    // This is the bridge that allows the SVG to call back into our Angular service land.
    // It accepts a node ID (e.g., "Alice"), looks up the line number from our map, and calls the highlight function.
    (window as any)._mermaidGlobalClickCallback = (nodeId: string) => {
      const lineNumber = this.nodeIdToLineNumberMap.get(nodeId);
      if (lineNumber) {
        this.highlightCallback?.(lineNumber);
      }
    };

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: themeSignal(),
        securityLevel: 'loose',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      });
      this.isInitialized = true;
      this.highlightCallback = getHighlightCallback();
    } catch (e) {
      console.error('Failed to initialize Mermaid.js.', e);
    }
  }

  async validate(code: string): Promise<{ isValid: boolean, error: MermaidValidationError | null }> {
    if (!this.isInitialized) return { isValid: false, error: { message: 'Mermaid.js not initialized.', lineNumber: 1 } };
    if (!code.trim()) return { isValid: true, error: null };
    
    try {
      await mermaid.parse(code);
      return { isValid: true, error: null };
    } catch (e: any) {
      const errorMessage = e.message || String(e);
      const lineMatch = errorMessage.match(/Parse error on line (\d+):/);
      const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : 1;
      const friendlyMessage = errorMessage.replace(/Parse error on line \d+:/, '').trim();

      return { isValid: false, error: { message: friendlyMessage, lineNumber } };
    }
  }

  async render(elementId: string, code: string): Promise<SafeHtml> {
    if (!this.isInitialized || !code.trim()) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    try {
      const interactiveCode = this.addClickCallbacks(code);
      const { svg } = await mermaid.render(elementId, interactiveCode);
      return this.sanitizer.bypassSecurityTrustHtml(svg);
    } catch (e: any) {
      console.error('Mermaid rendering failed:', e);
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
  }

  private addClickCallbacks(code: string): string {
    const lines = code.split('\n');
    const firstLine = lines.find(l => l.trim() !== '')?.trim() || '';

    // This interactive feature is complex to generalize.
    // To fix parsing errors on unsupported chart types (like pie, gantt),
    // we will scope it only to sequence diagrams for now.
    if (!firstLine.startsWith('sequenceDiagram')) {
      return code;
    }

    // Clear the map for each new render to ensure it's fresh.
    this.nodeIdToLineNumberMap.clear();

    // Regex to safely find only participant/actor definitions.
    const participantRegex = /^\s*(?:participant|actor)\s+([a-zA-Z0-9_]+)/;

    lines.forEach((line, index) => {
      const match = line.match(participantRegex);
      if (match && match[1]) {
        const id = match[1];
        if (!this.nodeIdToLineNumberMap.has(id)) {
          // Line numbers are 1-based for the editor.
          this.nodeIdToLineNumberMap.set(id, index + 1);
        }
      }
    });

    if (this.nodeIdToLineNumberMap.size === 0) {
      return code;
    }

    let callbacks = '';
    // Use the correct, documented syntax. Mermaid will automatically pass the node's ID to the callback.
    for (const id of this.nodeIdToLineNumberMap.keys()) {
      callbacks += `\nclick ${id} call _mermaidGlobalClickCallback()`;
    }
    
    return code + callbacks;
  }
}