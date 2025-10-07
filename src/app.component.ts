import { Component, ChangeDetectionStrategy, signal, effect, inject, OnInit, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

import { Command, CommandService } from './command.service';
import { ExportService } from './export.service';
import { GeminiAiService } from './gemini-ai.service';
import { MermaidService, MermaidValidationError } from './mermaid.service';
import { MonacoService } from './monaco.service';
import { CollaborationService } from './collaboration.service';
import { ScriptLoaderService } from './script-loader.service';
import { HistoryEntry, HistoryService } from './history.service';

const PUBNUB_SDK_URL = 'https://cdn.pubnub.com/sdk/javascript/pubnub.7.2.2.min.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CommandService, ExportService, GeminiAiService, MermaidService, MonacoService, CollaborationService, ScriptLoaderService, HistoryService],
  host: {
    '(document:mousemove)': 'onDocumentMouseMove($event)',
    '(document:mouseup)': 'stopDragActions()',
    '(document:mouseleave)': 'stopDragActions()',
    '(window:keydown)': 'handleKeyboardEvents($event)',
  },
})
export class AppComponent implements OnInit, AfterViewInit {
  // --- Service Injections ---
  private readonly commandService = inject(CommandService);
  private readonly exportService = inject(ExportService);
  private readonly geminiService = inject(GeminiAiService);
  private readonly mermaidService = inject(MermaidService);
  private readonly monacoService = inject(MonacoService);
  private readonly collaborationService = inject(CollaborationService);
  private readonly scriptLoaderService = inject(ScriptLoaderService);
  private readonly historyService = inject(HistoryService);

  private debounceTimer: any;
  private publishDebounceTimer: any;
  private isRemoteUpdate = false;

  // --- Element References ---
  @ViewChild('editorContainer') editorContainerEl!: ElementRef<HTMLDivElement>;
  @ViewChild('previewContainer') previewContainerEl!: ElementRef<HTMLDivElement>;
  
  // --- State Signals ---
  mermaidCode = signal<string>('');
  renderedSvg = signal<SafeHtml>('');
  error = signal<MermaidValidationError | null>(null);
  isLoading = signal<boolean>(true);

  // --- Theme State ---
  readonly mermaidThemes = ['dark', 'default', 'neutral', 'forest'];
  mermaidTheme = signal<string>('dark');
  
  // --- Resizable Panes State ---
  isResizing = signal(false);
  editorWidth = signal(50);
  
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

  // --- History State ---
  isHistoryViewerOpen = signal(false);
  historyVersions = signal<HistoryEntry[]>([]);

  // --- Collaboration State ---
  shareLinkCopied = signal(false);

  // --- Public Properties from Services ---
  readonly diagramExamples = this.commandService.diagramExamples;
  readonly commands = this.commandService.getCommands(this);
  readonly canUndo = this.monacoService.canUndo;
  readonly canRedo = this.monacoService.canRedo;
  readonly connectedUsers = this.collaborationService.users;

  // --- Computed Signals ---
  previewTransform = computed(() => `scale(${this.zoomLevel()}) translate(${this.panOffset().x}px, ${this.panOffset().y}px)`);
  
  filteredCommands = computed(() => {
    const query = this.commandSearchQuery().toLowerCase().trim();
    if (!query) return this.commands;
    return this.commands.filter(cmd => cmd.name.toLowerCase().includes(query));
  });

  isLive = computed(() => this.connectedUsers().length > 1);

  constructor() {
    // Main effect to react to code changes from this component to render SVG
    effect(() => {
      const code = this.mermaidCode();
      this.isLoading.set(true);
      clearTimeout(this.debounceTimer);
      
      this.debounceTimer = setTimeout(async () => {
        this.historyService.addVersion(code); // Save version to history
        const { isValid, error } = await this.mermaidService.validate(code);
        if (isValid) {
          this.error.set(null);
          const svg = await this.mermaidService.render('mermaid-preview', code);
          this.renderedSvg.set(svg);
        } else {
          this.error.set(error);
          this.renderedSvg.set('');
        }
        this.isLoading.set(false);
      }, 300);
    });

    // Effect to react to code changes from the Monaco editor service
    effect(() => {
        const editorCode = this.monacoService.code();
        if(this.mermaidCode() !== editorCode) {
            this.mermaidCode.set(editorCode);
        }
    });

    // Effect to publish local code changes for collaboration
    effect(() => {
      const code = this.monacoService.code();

      // This flag prevents re-broadcasting changes that came from a remote user
      if (this.isRemoteUpdate) {
        this.isRemoteUpdate = false;
        return;
      }

      clearTimeout(this.publishDebounceTimer);
      this.publishDebounceTimer = setTimeout(() => {
        this.collaborationService.publishCode(code);
      }, 500);
    });

    // Effect to visually highlight errors in the editor
    effect(() => {
      const currentError = this.error();
      this.monacoService.setErrorLine(currentError?.lineNumber ?? null);
    });
  }

  ngOnInit() {
    const savedCode = this.historyService.getLatestVersion()?.code || this.diagramExamples[0].code;
    this.mermaidCode.set(savedCode);
    this.mermaidService.initialize(this.mermaidTheme, () => this.monacoService.highlightLine.bind(this.monacoService));
    this.geminiService.initialize();
    this.initializeCollaboration();
  }
  
  async ngAfterViewInit() {
    await this.monacoService.initializeEditor(this.editorContainerEl.nativeElement, this.mermaidCode());
  }

  private async initializeCollaboration() {
    try {
      await this.scriptLoaderService.loadScript(PUBNUB_SDK_URL, 'PubNub');
      
      // Now that the script is loaded, PubNub is guaranteed to be available.
      let session = window.location.hash.substring(1);
      if (!session) {
        session = `session-${Math.random().toString(36).substr(2, 9)}`;
        window.location.hash = session;
      }
      
      const remoteUpdateCallback = (code: string) => {
        this.isRemoteUpdate = true;
        this.monacoService.setValue(code);
      };

      this.collaborationService.initialize(session, remoteUpdateCallback);

    } catch (error) {
      console.error('Failed to load PubNub SDK. Collaboration features will be disabled.', error);
    }
  }

  handleKeyboardEvents(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
      event.preventDefault();
      this.toggleCommandPalette();
    }
    if (event.key === 'Escape') {
      if (this.isCommandPaletteOpen()) this.closeCommandPalette();
      if (this.isHistoryViewerOpen()) this.closeHistoryViewer();
    }
  }

  loadExample(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newCode = selectElement.value;
    if (newCode) {
      this.monacoService.setValue(newCode);
      selectElement.selectedIndex = 0;
    }
  }

  changeTheme(event: Event) {
    const theme = (event.target as HTMLSelectElement).value;
    this.mermaidTheme.set(theme);
    // Re-render with the new theme
    this.mermaidCode.update(c => c);
  }

  shareSession() {
    navigator.clipboard.writeText(window.location.href);
    this.shareLinkCopied.set(true);
    setTimeout(() => this.shareLinkCopied.set(false), 2000);
  }

  // --- Editor Actions ---
  undo() { this.monacoService.undo(); }
  redo() { this.monacoService.redo(); }
  formatCode() { this.monacoService.formatCode(); }

  // --- Pane Resizing & Panning (Consolidated Event Handlers) ---
  startResize(event: MouseEvent) { event.preventDefault(); this.isResizing.set(true); }
  startPan(event: MouseEvent) {
    event.preventDefault();
    this.isPanning.set(true);
    this.panStart.x = event.clientX - this.panOffset().x * this.zoomLevel();
    this.panStart.y = event.clientY - this.panOffset().y * this.zoomLevel();
  }

  onDocumentMouseMove(event: MouseEvent) {
    // Dispatch to the correct handler based on state
    this.onResize(event);
    this.onPan(event);
  }

  stopDragActions() {
    this.isResizing.set(false);
    this.isPanning.set(false);
  }
  
  private onResize(event: MouseEvent) {
    if (!this.isResizing()) return;
    const percentage = (event.clientX / window.innerWidth) * 100;
    if (percentage > 20 && percentage < 80) {
      this.editorWidth.set(percentage);
    }
  }

  private onPan(event: MouseEvent) {
    if (!this.isPanning()) return;
    const dx = event.clientX - this.panStart.x;
    const dy = event.clientY - this.panStart.y;
    this.panOffset.set({ x: dx / this.zoomLevel(), y: dy / this.zoomLevel() });
  }

  // --- Zoom ---
  zoomIn() { this.zoomLevel.update(z => Math.min(z * 1.2, 5)); }
  zoomOut() { this.zoomLevel.update(z => Math.max(z / 1.2, 0.2)); }
  resetZoom() { this.zoomLevel.set(1); this.panOffset.set({ x: 0, y: 0 }); }

  // --- Export ---
  exportSvg() { this.exportService.exportSvg(this.previewContainerEl.nativeElement); }
  exportPng() { this.exportService.exportPng(this.previewContainerEl.nativeElement); }

  // --- AI Features ---
  openAiModal(mode: 'generate' | 'explain' | 'refine') {
    this.aiPrompt.set('');
    this.aiRefinePrompt.set('');
    this.aiExplanation.set('');
    this.aiModalMode.set(mode);
    if (mode === 'explain') this.explainCodeWithAi();
  }
  closeAiModal() { this.aiModalMode.set(null); }

  async handleAiAction(action: Promise<string | null>, successCallback: (result: string) => void) {
    this.isAiLoading.set(true);
    try {
      const result = await action;
      if (result) {
        successCallback(result);
      }
    } catch (e) {
      this.aiExplanation.set(`An error occurred. Please check the console.`);
      console.error(e);
    } finally {
      this.isAiLoading.set(false);
    }
  }

  generateDiagramWithAi() {
    this.handleAiAction(
      this.geminiService.generateDiagram(this.aiPrompt()),
      (newCode) => {
        this.monacoService.setValue(newCode);
        this.closeAiModal();
      }
    );
  }
  
  explainCodeWithAi() {
    this.handleAiAction(
      this.geminiService.explainCode(this.mermaidCode()),
      (explanation) => this.aiExplanation.set(explanation)
    );
  }

  fixCodeWithAi() {
    const currentError = this.error();
    if (!currentError) return;

    this.isLoading.set(true); // Show editor loading spinner
    this.handleAiAction(
      this.geminiService.fixCode(this.mermaidCode(), currentError.message),
      (fixedCode) => this.monacoService.setValue(fixedCode)
    ).finally(() => this.isLoading.set(false));
  }

  refineCodeWithAi() {
    this.handleAiAction(
      this.geminiService.refineCode(this.mermaidCode(), this.aiRefinePrompt()),
      (refinedCode) => {
        this.monacoService.setValue(refinedCode);
        this.closeAiModal();
      }
    );
  }

  // --- Command Palette ---
  toggleCommandPalette() { this.isCommandPaletteOpen.update(v => !v); }
  openCommandPalette() { this.commandSearchQuery.set(''); this.isCommandPaletteOpen.set(true); }
  closeCommandPalette() { this.isCommandPaletteOpen.set(false); }
  executeCommand(command: Command) {
    command.action();
    this.closeCommandPalette();
  }

  // --- History ---
  openHistoryViewer() {
    this.historyVersions.set(this.historyService.getHistory());
    this.isHistoryViewerOpen.set(true);
  }
  closeHistoryViewer() {
    this.isHistoryViewerOpen.set(false);
  }
  restoreVersion(entry: HistoryEntry) {
    this.monacoService.setValue(entry.code);
    this.closeHistoryViewer();
    this.monacoService.focus();
  }

  formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

    return new Date(timestamp).toLocaleString();
  }
}