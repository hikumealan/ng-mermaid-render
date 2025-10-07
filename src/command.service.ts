import { Injectable } from '@angular/core';
import { AppComponent } from './app.component'; // Use for type inference only

export interface Command {
  id: string;
  name: string;
  action: () => void;
  icon: string;
}

export interface DiagramExample {
  name: string;
  code: string;
}

@Injectable()
export class CommandService {
  
  readonly diagramExamples: DiagramExample[] = [
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
    Alice->>Bob: Great to hear!`
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
    },
    {
        name: 'Class Diagram',
        code: `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
    class Zebra{
        +bool is_wild
        +run()
    }`
    },
    {
        name: 'State Diagram',
        code: `stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`
    },
    {
        name: 'ER Diagram',
        code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`
    }
  ];

  getCommands(component: AppComponent): Command[] {
    return [
      { id: 'session.share', name: 'Share Session...', action: () => component.shareSession(), icon: 'M8.684 13.342a8.958 8.958 0 01-2.384-5.446 9.01 9.01 0 011.02-4.575M8.684 13.342c.045.021.09.041.136.061a9.01 9.01 0 005.52-2.384 8.958 8.958 0 002.384-5.446 9.01 9.01 0 00-1.02-4.575M8.684 13.342L17.5 8.5m-8.816-3.842L3.5 11.5' },
      { id: 'history.view', name: 'View Version History...', action: () => component.openHistoryViewer(), icon: 'M10 2a8 8 0 00-8 8a1 1 0 001 1h1.586l-2.293 2.293a1 1 0 101.414 1.414L6 13.414V16a1 1 0 102 0v-5a1 1 0 00-1-1H4a1 1 0 100-2h3V2a1 1 0 10-2 0v1.586l-1.707-1.707A8.002 8.002 0 0010 2z' },
      { id: 'ai.generate', name: 'Generate with AI...', action: () => component.openAiModal('generate'), icon: 'M5 2a1 1 0 00-1 1v1.586l-2.293 2.293a1 1 0 000 1.414l2.293 2.293V13a1 1 0 102 0v-1.586l2.293-2.293a1 1 0 000-1.414L6 5.414V4a1 1 0 00-1-1zm10 0a1 1 0 00-1 1v1.586l-2.293 2.293a1 1 0 000 1.414l2.293 2.293V13a1 1 0 102 0v-1.586l2.293-2.293a1 1 0 000-1.414L16 5.414V4a1 1 0 00-1-1zm-3.828 7.379a1 1 0 00-1.414 0L8.05 11.086a1 1 0 000 1.414l1.707 1.707a1 1 0 001.414-1.414L9.464 11.793l1.707-1.707a1 1 0 000-1.414z' },
      { id: 'ai.refine', name: 'Refine with AI...', action: () => component.openAiModal('refine'), icon: 'M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z' },
      { id: 'ai.explain', name: 'Explain Code', action: () => component.openAiModal('explain'), icon: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' },
      { id: 'ai.fix', name: 'Fix Code with AI', action: () => component.fixCodeWithAi(), icon: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z' },
      { id: 'editor.format', name: 'Format Code', action: () => component.formatCode(), icon: 'M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z' },
      { id: 'file.export.svg', name: 'Export as SVG', action: () => component.exportSvg(), icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
      { id: 'file.export.png', name: 'Export as PNG', action: () => component.exportPng(), icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
      { id: 'view.reset', name: 'Reset View', action: () => component.resetZoom(), icon: 'M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm10.5 10.5a1 1 0 000-1.414L13.414 10l1.086-1.086a1 1 0 00-1.414-1.414L12 8.586l-1.086-1.086a1 1 0 00-1.414 1.414L10.586 10l-1.086 1.086a1 1 0 001.414 1.414L12 11.414l1.086 1.086a1 1 0 001.414 0z' }
    ];
  }
}