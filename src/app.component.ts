
import { Component, ChangeDetectionStrategy, signal, effect, inject, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// This tells TypeScript that the mermaid object exists on the global scope
declare const mermaid: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private debounceTimer: any;

  // --- Signals for State Management ---
  
  mermaidCode = signal<string>(
`graph TD
    A[Start] --> B{Is it a good idea?};
    B -- Yes --> C[Do it!];
    C --> D[End];
    B -- No --> E[Think again];
    E --> B;`
  );

  renderedSvg = signal<SafeHtml>('');
  errorMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const code = this.mermaidCode();
      
      this.isLoading.set(true);
      // Debounce the rendering call
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.renderDiagram(code);
      }, 300);
    });
  }

  ngOnInit() {
    // Initialize mermaid once the component is ready
    if (typeof mermaid !== 'undefined') {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        });
        // Initial render
        this.renderDiagram(this.mermaidCode());
      } catch (e) {
        this.errorMessage.set('Failed to initialize Mermaid.js.');
      }
    } else {
      this.errorMessage.set('Mermaid.js library not loaded. Please check your internet connection and refresh the page.');
    }
  }
  
  updateCode(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.mermaidCode.set(target.value);
  }

  private async renderDiagram(code: string) {
    if (!code.trim()) {
      this.renderedSvg.set('');
      this.errorMessage.set('');
      this.isLoading.set(false);
      return;
    }

    this.errorMessage.set('');
    
    if (typeof mermaid === 'undefined') {
      this.errorMessage.set('Mermaid.js library not loaded.');
      this.isLoading.set(false);
      return;
    }

    try {
      // Mermaid's modern API returns a promise
      const { svg } = await mermaid.render('mermaid-preview', code);
      this.renderedSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
    } catch (e: any) {
      this.renderedSvg.set(''); // Clear previous valid SVG on error
      const friendlyMessage = this.formatMermaidError(e.message || String(e));
      this.errorMessage.set(friendlyMessage);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private formatMermaidError(errorMessage: string): string {
      // Make the common mermaid error more readable
      if (errorMessage.includes("Lexical error")) {
        return 'Error: Diagram syntax is incorrect. Please check your Mermaid code for typos or structural errors.';
      }
      return errorMessage;
  }
}
