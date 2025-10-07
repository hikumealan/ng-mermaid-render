import { Component, ChangeDetectionStrategy, signal, effect, inject, OnInit, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// This tells TypeScript that the mermaid object exists on the global scope
declare const mermaid: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, AfterViewInit {
  private readonly sanitizer = inject(DomSanitizer);
  private debounceTimer: any;

  // --- Element References ---
  @ViewChild('editor') editorEl!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('lineNumbers') lineNumbersEl!: ElementRef<HTMLDivElement>;

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
  errorLine = signal<number | null>(null);

  // --- Computed Signals ---
  lines = computed(() => this.mermaidCode().split('\n'));

  constructor() {
    // This effect re-renders the diagram whenever the code changes, with a debounce.
    effect(() => {
      const code = this.mermaidCode();
      
      this.isLoading.set(true);
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
  
  ngAfterViewInit() {
    // Sync scroll on textarea resize (e.g., if devtools change viewport)
    if (this.editorEl) {
        // By wrapping the syncScroll call in requestAnimationFrame, we ensure that
        // the scroll synchronization happens in the next paint cycle. This avoids
        // the "ResizeObserver loop" error that can occur if the observer's callback
        // triggers another resize event within the same frame.
        const resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => this.syncScroll());
        });
        resizeObserver.observe(this.editorEl.nativeElement);
    }
  }

  updateCode(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.mermaidCode.set(target.value);
    // When code is updated, especially with line breaks, sync scroll.
    // requestAnimationFrame waits for the next paint, ensuring DOM has updated.
    requestAnimationFrame(() => this.syncScroll());
  }

  onEditorScroll() {
    this.syncScroll();
  }

  private syncScroll() {
    if (this.lineNumbersEl?.nativeElement && this.editorEl?.nativeElement) {
      this.lineNumbersEl.nativeElement.scrollTop = this.editorEl.nativeElement.scrollTop;
    }
  }

  private async renderDiagram(code: string) {
    if (!code.trim()) {
      this.renderedSvg.set('');
      this.errorMessage.set('');
      this.errorLine.set(null);
      this.isLoading.set(false);
      return;
    }

    this.errorMessage.set('');
    this.errorLine.set(null);
    
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
      this.parseAndSetError(e.message || String(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private parseAndSetError(errorMessage: string): void {
      const lineMatch = errorMessage.match(/line:?\s+(\d+)/i);
      
      if (lineMatch && lineMatch[1]) {
        const lineNum = parseInt(lineMatch[1], 10);
        this.errorLine.set(lineNum);

        const codeLines = this.lines();
        const problematicLine = codeLines[lineNum - 1]?.trim() ?? '';
        
        // Clean up the raw mermaid error for a more user-friendly display
        const friendlyError = errorMessage
            .replace(/Parse error on line \d+:/, '')
            .trim();

        this.errorMessage.set(
            `Error on line ${lineNum}: "${problematicLine}"\n\n${friendlyError}`
        );

      } else {
         this.errorLine.set(null);
         if (errorMessage.includes("Lexical error")) {
            this.errorMessage.set('Error: Diagram syntax is incorrect. Please check your Mermaid code for typos or structural errors.');
         } else {
            this.errorMessage.set(errorMessage);
         }
      }
  }
}
