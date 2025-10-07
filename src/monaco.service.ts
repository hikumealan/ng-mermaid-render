import { Injectable, signal } from '@angular/core';

declare const monaco: any;

@Injectable()
export class MonacoService {
  private editorInstance: any;
  private errorDecorations: any;

  code = signal<string>('');
  canUndo = signal(false);
  canRedo = signal(false);

  async initializeEditor(element: HTMLElement, initialCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof (window as any).require === 'undefined') {
        console.error('Monaco loader not found.');
        return reject('Monaco loader not found.');
      }

      (window as any).require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
      (window as any).require(['vs/editor/editor.main'], () => {
        // Register a custom language for Mermaid
        monaco.languages.register({ id: 'mermaid' });
        // Define syntax highlighting rules for the 'mermaid' language
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

        this.editorInstance = monaco.editor.create(element, {
          value: initialCode,
          language: 'mermaid',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: true },
          wordWrap: 'on',
          glyphMargin: true, // Enable the margin for error glyphs
        });

        this.code.set(initialCode);
        this.errorDecorations = this.editorInstance.createDecorationsCollection([]);

        // Listen for content changes
        this.editorInstance.getModel().onDidChangeContent(() => {
          const value = this.editorInstance.getValue();
          this.code.set(value);
          this.updateUndoRedoState();
        });

        this.updateUndoRedoState();
        resolve();
      });
    });
  }

  setValue(value: string) {
    this.editorInstance?.setValue(value);
  }
  
  getValue(): string {
    return this.editorInstance?.getValue() ?? '';
  }

  formatCode() {
    this.editorInstance?.getAction('editor.action.formatDocument').run();
  }

  undo() {
    this.editorInstance?.trigger('toolbar', 'undo', null);
  }

  redo() {
    this.editorInstance?.trigger('toolbar', 'redo', null);
  }

  focus() {
    this.editorInstance?.focus();
  }

  highlightLine(lineNumber: number) {
    if (!this.editorInstance) return;
    this.editorInstance.revealLineInCenter(lineNumber, monaco.editor.ScrollType.Smooth);
    this.editorInstance.setPosition({ lineNumber: lineNumber, column: 1 });
    
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

  setErrorLine(lineNumber: number | null) {
    if (!this.editorInstance || !this.errorDecorations) return;

    if (lineNumber === null) {
      this.errorDecorations.clear();
      return;
    }

    this.errorDecorations.set([
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'editor-line-error-highlight',
          glyphMarginClassName: 'editor-error-glyph',
          glyphMarginHoverMessage: { value: 'Syntax Error' }
        }
      }
    ]);
    
    this.editorInstance.revealLineInCenterIfOutsideViewport(lineNumber, monaco.editor.ScrollType.Smooth);
  }

  private updateUndoRedoState() {
    if (!this.editorInstance) return;
    const model = this.editorInstance.getModel();
    if(model) {
        this.canUndo.set(model.canUndo());
        this.canRedo.set(model.canRedo());
    }
  }
}