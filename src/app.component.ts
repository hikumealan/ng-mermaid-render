import { Component, ChangeDetectionStrategy, signal, effect, inject, OnInit, computed, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// This tells TypeScript that these objects exist on the global scope
declare const mermaid: any;
declare const monaco: any;
declare const genai: any; // From @google/generative-ai CDN script

const STORAGE_KEY = 'mermaid-editor-code';

const DIAGRAM_EXAMPLES = [
    {
        name: 'Flow Chart',
        code: `graph TD
    A[Start] --> B{Is it a good idea?};
    B -- Yes --> C[Do it!];
    C --> D[End];
    B -- No --> E[Think again];
    E --> B;`
    },
    {
        name: 'Sequence Diagram',
        code: `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob, how are you?
    Bob-->>Alice: I am good thanks!
    Alice-)Bob: Great to hear.`
    },
    {
        name: 'Pie Chart',
        code: `pie
    title Key Technologies
    "Angular" : 45
    "Tailwind CSS" : 25
    "MermaidJS" : 15
    "TypeScript" : 15`
    },
    {
        name: 'Gantt Chart',
        code: `gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2024-01-01, 30d
    Another task     :after a1  , 20d
    section Another
    Task in sec      :2024-01-12  , 12d
    another task      : 24d`
    }
];

interface Command {
  id: string;
  name: string;
  action: () => void;
  icon: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:mousemove)': 'onResize($event)',
    '(document:mouseup)': 'stopResize()',
    '(document:mouseleave)': 'stopResize()',
  },
})
export class AppComponent implements OnInit, AfterViewInit {
  private readonly sanitizer = inject(DomSanitizer);
  private debounceTimer: any;
  private editorInstance: any;
  private ai: any;

  // --- Diagram Examples ---
  readonly diagramExamples = DIAGRAM_EXAMPLES;

  // --- Element References ---
  @ViewChild('editorContainer') editorContainerEl!: ElementRef<HTMLDivElement>;

  // --- State Signals ---
  mermaidCode = signal<string>(DIAGRAM_EXAMPLES[0].code);
  renderedSvg = signal<SafeHtml>('');
  errorMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  // --- Editor State ---
  canUndo = signal(false);
  canRedo = signal(false);
  
  // --- Theme State ---
  readonly mermaidThemes = ['dark', 'default', 'neutral', 'forest'];
  mermaidTheme = signal<string>('dark');
  
  // --- Resizable Panes State ---
  isResizing = signal(false);
  editorWidth = signal(50); // Initial width in percentage
  
  // --- Zoom/Pan State ---
  zoomLevel = signal(1);
  panOffset = signal({ x: 0, y: 0 });
  isPanning = signal(false);
  private panStart = { x: 0, y: 0 };

  // --- AI Feature State ---
  aiModalMode = signal<'generate' | 'explain' | 'refine' | null>(null);
  aiPrompt = signal('');
  aiRefinePrompt = signal('');
  aiExplanation = signal('');
  isAiLoading = signal(false);
  
  // --- Command Palette State ---
  isCommandPaletteOpen = signal(false);
  commandSearchQuery = signal('');

  // --- Computed Signals ---
  previewTransform = computed(() => `scale(${this.zoomLevel()}) translate(${this.panOffset().x}px, ${this.panOffset().y}px)`);

  // --- Commands ---
  readonly commands: Command[] = [
    { id: 'ai.generate', name: 'Generate with AI...', action: () => this.openAiModal('generate'), icon: 'M5 2a1 1 0 00-1 1v1.586l-2.293 2.293a1 1 0 000 1.414l2.293 2.293V13a1 1 0 102 0v-1.586l2.293-2.293a1 1 0 000-1.414L6 5.414V4a1 1 0 00-1-1zm10 0a1 1 0 00-1 1v1.586l-2.293 2.293a1 1 0 000 1.414l2.293 2.293V13a1 1 0 102 0v-1.586l2.293-2.293a1 1 0 000-1.414L16 5.414V4a1 1 0 00-1-1zm-3.828 7.379a1 1 0 00-1.414 0L8.05 11.086a1 1 0 000 1.414l1.707 1.707a1 1 0 001.414-1.414L9.464 11.793l1.707-1.707a1 1 0 000-1.414z' },
    { id: 'ai.refine', name: 'Refine with AI...', action: () => this.openAiModal('refine'), icon: 'M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z' },
    { id: 'ai.explain', name: 'Explain Code', action: () => this.openAiModal('explain'), icon: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' },
    { id: 'ai.fix', name: 'Fix Code with AI', action: () => this.fixCodeWithAi(), icon: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z' },
    { id: 'editor.format', name: 'Format Code', action: () => this.formatCode(), icon: 'M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z' },
    { id: 'file.export.svg', name: 'Export as SVG', action: () => this.exportSvg(), icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
    { id: 'file.export.png', name: 'Export as PNG', action: () => this.exportPng(), icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
    { id: 'view.reset', name: 'Reset View', action: () => this.resetZoom(), icon: 'M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm10.5 10.5a1 1 0 000-1.414L13.414 10l1.086-1.086a1 1 0 00-1.414-1.414L12 8.586l-1.086-1.086a1 1 0 00-1.414 1.414L10.586 10l-1.086 1.086a1 1 0 001.414 1.414L12 11.414l1.086 1.086a1 1 0 001.414 0z' }
  ];

  filteredCommands = computed(() => {
    const query = this.commandSearchQuery().toLowerCase().trim();
    if (!query) return this.commands;
    return this.commands.filter(cmd => cmd.name.toLowerCase().includes(query));
  });

  constructor() {
    effect(() => {
      const code = this.mermaidCode();
      this.isLoading.set(true);
      clearTimeout(this.debounceTimer);
      
      this.debounceTimer = setTimeout(async () => {
        localStorage.setItem(STORAGE_KEY, code);
        const isValid = await this.validateCode(code);
        if (isValid) {
          await this.renderDiagram(code);
        } else {
          this.renderedSvg.set('');
          this.isLoading.set(false);
        }
      }, 300);
    });
  }

  ngOnInit() {
    this.loadCodeFromStorage();
    this.initializeMermaid();
    if (typeof genai !== 'undefined' && process.env.API_KEY) {
      this.ai = new genai.GoogleGenAI({ apiKey: process.env.API_KEY });
    } else {
      console.warn('Gemini API key not found or AI library not loaded. AI features will be disabled.');
    }

    (window as any).highlightLineInEditor = (lineNumber: number) => this.highlightEditorLine(lineNumber);
  }
  
  async ngAfterViewInit() {
    await this.initializeMonacoEditor();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvents(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
      event.preventDefault();
      this.toggleCommandPalette();
    }
    if (event.key === 'Escape' && this.isCommandPaletteOpen()) {
      this.closeCommandPalette();
    }
  }

  private loadCodeFromStorage() {
    const savedCode = localStorage.getItem(STORAGE_KEY);
    if (savedCode) {
      this.mermaidCode.set(savedCode);
    }
  }

  private initializeMermaid() {
     if (typeof mermaid !== 'undefined') {
        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: this.mermaidTheme(),
                securityLevel: 'loose',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
            });
        } catch(e) {
            this.errorMessage.set('Failed to initialize Mermaid.js.');
        }
     } else {
        this.errorMessage.set('Mermaid.js library not loaded.');
     }
  }

  private async initializeMonacoEditor() {
    if (typeof (window as any).require === 'undefined') {
      console.error('Monaco loader not found.');
      return;
    }

    (window as any).require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
    (window as any).require(['vs/editor/editor.main'], () => {
      monaco.languages.register({ id: 'mermaid' });
      monaco.languages.setMonarchTokensProvider('mermaid', {
        tokenizer: {
          root: [
            [/^\s*(graph|sequenceDiagram|gantt|classDiagram|stateDiagram|pie|erDiagram|journey|requirementDiagram)/, "keyword"],
            [/[A-Z][a-zA-Z0-9_]*/, "type.identifier"],
            [/-->|-->>|->>|->/, "operator"],
            [/[:]/, "operator"],
            [/".*?"/, "string"],
            [/\[.*?\]/, "string.special"],
            [/\(.*?\)|\{.*?\}/, "string.special"],
          ]
        }
      });

      this.editorInstance = monaco.editor.create(this.editorContainerEl.nativeElement, {
        value: this.mermaidCode(),
        language: 'mermaid',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        wordWrap: 'on',
      });

      this.editorInstance.getModel().onDidChangeContent(() => {
        const value = this.editorInstance.getValue();
        this.mermaidCode.set(value);
        this.updateUndoRedoState();
      });

      this.updateUndoRedoState();
    });
  }

  private updateUndoRedoState() {
      if (!this.editorInstance) return;
      const model = this.editorInstance.getModel();
      this.canUndo.set(model.canUndo());
      this.canRedo.set(model.canRedo());
  }

  highlightEditorLine(lineNumber: number) {
    if (!this.editorInstance) return;
    this.editorInstance.revealLineInCenter(lineNumber, monaco.editor.ScrollType.Smooth);
    this.editorInstance.setPosition({ lineNumber: lineNumber, column: 1 });
    // This adds a temporary highlight decoration to the line
    const decorations = this.editorInstance.createDecorationsCollection([
        {
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
                isWholeLine: true,
                className: 'editor-line-highlight',
            },
        },
    ]);
    setTimeout(() => decorations.clear(), 1000); // Remove highlight after 1s
    this.editorInstance.focus();
  }

  loadExample(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newCode = selectElement.value;
    if (newCode) {
      this.editorInstance?.setValue(newCode);
      selectElement.selectedIndex = 0;
    }
  }

  changeTheme(event: Event) {
    const theme = (event.target as HTMLSelectElement).value;
    this.mermaidTheme.set(theme);
    this.initializeMermaid(); 
    this.renderDiagram(this.mermaidCode());
  }

  // --- Editor Actions ---
  undo() { this.editorInstance?.trigger('toolbar', 'undo', null); }
  redo() { this.editorInstance?.trigger('toolbar', 'redo', null); }
  formatCode() { this.editorInstance?.getAction('editor.action.formatDocument').run(); }

  // --- Pane Resizing ---
  startResize(event: MouseEvent) { event.preventDefault(); this.isResizing.set(true); }
  onResize(event: MouseEvent) {
    if (!this.isResizing()) return;
    const percentage = (event.clientX / window.innerWidth) * 100;
    if (percentage > 20 && percentage < 80) {
      this.editorWidth.set(percentage);
    }
  }
  stopResize() { this.isResizing.set(false); }

  // --- Zoom & Pan ---
  zoomIn() { this.zoomLevel.update(z => Math.min(z * 1.2, 5)); }
  zoomOut() { this.zoomLevel.update(z => Math.max(z / 1.2, 0.2)); }
  resetZoom() { this.zoomLevel.set(1); this.panOffset.set({ x: 0, y: 0 }); }
  
  startPan(event: MouseEvent) {
    event.preventDefault();
    this.isPanning.set(true);
    this.panStart.x = event.clientX - this.panOffset().x * this.zoomLevel();
    this.panStart.y = event.clientY - this.panOffset().y * this.zoomLevel();
  }

  @HostListener('document:mousemove', ['$event']) onPan(event: MouseEvent) {
    if (!this.isPanning()) return;
    const dx = event.clientX - this.panStart.x;
    const dy = event.clientY - this.panStart.y;
    this.panOffset.set({ x: dx / this.zoomLevel(), y: dy / this.zoomLevel() });
  }

  @HostListener('document:mouseup') stopPan() { this.isPanning.set(false); }

  // --- Export ---
  exportSvg() {
    const rawSvg = document.querySelector('#mermaid-preview-container > svg')?.outerHTML;
    if (!rawSvg) return;
    const blob = new Blob([rawSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagram.svg';
    link.click();
    URL.revokeObjectURL(url);
  }

  exportPng() {
    const rawSvg = document.querySelector('#mermaid-preview-container > svg')?.outerHTML;
    if (!rawSvg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width * 2; // Render at 2x for better quality
      canvas.height = img.height * 2;
      ctx?.scale(2,2);
      ctx?.drawImage(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = 'diagram.png';
      link.click();
    };
    img.onerror = (e) => console.error("Failed to load SVG for PNG export", e);
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(rawSvg)));
  }

  // --- AI Features ---
  openAiModal(mode: 'generate' | 'explain' | 'refine') {
    this.aiPrompt.set('');
    this.aiRefinePrompt.set('');
    this.aiExplanation.set('');
    this.aiModalMode.set(mode);
    if (mode === 'explain') this.explainCodeWithAi();
  }
  closeAiModal() { this.aiModalMode.set(null); }

  async generateDiagramWithAi() {
    if (!this.ai || !this.aiPrompt().trim()) return;
    this.isAiLoading.set(true);
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a description, and you must return only the Mermaid code block that represents that description. Do not include any explanation or markdown formatting like ```mermaid ... ```.";
    try {
      const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: this.aiPrompt(),
          config: { systemInstruction }
      });
      this.editorInstance?.setValue(response.text.trim());
      this.closeAiModal();
    } catch (e) {
      console.error(e);
      this.aiExplanation.set('An error occurred while generating the diagram.');
    } finally {
      this.isAiLoading.set(false);
    }
  }

  async explainCodeWithAi() {
    if (!this.ai || !this.mermaidCode().trim()) {
      this.aiExplanation.set('There is no code to explain.');
      return;
    }
    this.isAiLoading.set(true);
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a piece of Mermaid code. Explain what the diagram represents in a clear, concise way, using markdown for formatting if needed.";
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: this.mermaidCode(),
        config: { systemInstruction }
      });
      this.aiExplanation.set(response.text);
    } catch (e) {
      console.error(e);
      this.aiExplanation.set('An error occurred while explaining the code.');
    } finally {
      this.isAiLoading.set(false);
    }
  }

  async fixCodeWithAi() {
    if (!this.ai || !this.errorMessage()) return;
    this.isLoading.set(true); 
    const prompt = `The following MermaidJS code has an error.\n\nCODE:\n\`\`\`mermaid\n${this.mermaidCode()}\n\`\`\`\n\nERROR:\n${this.errorMessage()}\n\nPlease fix the code.`;
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a piece of Mermaid code that has an error, along with the error message. Your task is to fix the code. Return only the corrected Mermaid code block, without any explanation or markdown formatting.";
    try {
      const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { systemInstruction }
      });
      this.editorInstance?.setValue(response.text.trim());
    } catch(e) {
      console.error(e);
      this.errorMessage.set('AI fix failed. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async refineCodeWithAi() {
    if (!this.ai || !this.aiRefinePrompt().trim()) return;
    this.isAiLoading.set(true);
    const prompt = `Here is a MermaidJS diagram. Please apply the following change: "${this.aiRefinePrompt()}".\n\nCODE:\n\`\`\`mermaid\n${this.mermaidCode()}\n\`\`\``;
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a diagram and a requested change. Your task is to update the code to reflect the change. Return only the complete, corrected Mermaid code block, without any explanation or markdown formatting.";
     try {
      const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { systemInstruction }
      });
      this.editorInstance?.setValue(response.text.trim());
      this.closeAiModal();
    } catch(e) {
      console.error(e);
      this.aiExplanation.set('An error occurred while refining the diagram.');
    } finally {
      this.isAiLoading.set(false);
    }
  }

  // --- Command Palette ---
  toggleCommandPalette() { this.isCommandPaletteOpen.update(v => !v); }
  openCommandPalette() { this.commandSearchQuery.set(''); this.isCommandPaletteOpen.set(true); }
  closeCommandPalette() { this.isCommandPaletteOpen.set(false); }
  executeCommand(command: Command) {
    command.action();
    this.closeCommandPalette();
  }

  // --- Rendering & Validation ---
  private addClickCallbacks(code: string): string {
    const lines = code.split('\n');
    const nodeMap = new Map<string, number>();
    const nodeRegex = /^\s*([a-zA-Z0-9_]+)(?:\[.*\]|\(.*\)|>.*\]|\{.*\}|)?\s*$/;
    const participantRegex = /^\s*(?:participant|actor)\s+([a-zA-Z0-9_]+)/;
    
    lines.forEach((line, index) => {
      const nodeMatch = line.match(nodeRegex);
      const participantMatch = line.match(participantRegex);
      const id = nodeMatch?.[1] || participantMatch?.[1];
      if (id && !nodeMap.has(id)) {
        nodeMap.set(id, index + 1); // Line numbers are 1-based
      }
    });

    let callbacks = '';
    for (const [id, lineNumber] of nodeMap.entries()) {
      callbacks += `\nclick ${id} call highlightLineInEditor(${lineNumber})`;
    }
    return code + callbacks;
  }

  private async validateCode(code: string): Promise<boolean> {
    if (!code.trim()) {
      this.errorMessage.set('');
      return true;
    }
    if (typeof mermaid === 'undefined') {
      this.errorMessage.set('Mermaid.js library not loaded.');
      return false;
    }
    try {
      // We parse the original code, not the one with callbacks
      await mermaid.parse(code);
      this.errorMessage.set('');
      return true;
    } catch (e: any) {
      this.parseAndSetError(e.message || String(e));
      return false;
    }
  }

  private async renderDiagram(code: string) {
    if (!code.trim()) {
      this.renderedSvg.set('');
      this.isLoading.set(false);
      return;
    }
    try {
      const interactiveCode = this.addClickCallbacks(code);
      const { svg } = await mermaid.render('mermaid-preview', interactiveCode);
      this.renderedSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
    } catch (e: any) {
      this.renderedSvg.set(''); 
      this.parseAndSetError(e.message || String(e));
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private parseAndSetError(errorMessage: string): void {
      const friendlyError = errorMessage.replace(/Parse error on line \d+:/, '').trim();
      this.errorMessage.set(friendlyError);
  }
}