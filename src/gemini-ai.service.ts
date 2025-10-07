import { Injectable } from '@angular/core';

declare const genai: any;

@Injectable()
export class GeminiAiService {
  private ai: any;

  initialize() {
    if (typeof genai !== 'undefined' && process.env.API_KEY) {
      try {
        this.ai = new genai.GoogleGenAI({ apiKey: process.env.API_KEY });
      } catch (e) {
        console.error("Failed to initialize Gemini AI Client", e);
      }
    } else {
      console.warn('Gemini API key not found or AI library not loaded. AI features will be disabled.');
    }
  }

  private async generateContent(prompt: string, systemInstruction: string): Promise<string | null> {
    if (!this.ai) {
        console.error('AI Service not initialized.');
        return null;
    }
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction }
        });
        return response.text.trim();
    } catch(e) {
        console.error("Gemini AI API call failed:", e);
        throw e; // Re-throw to be caught by the caller
    }
  }

  generateDiagram(prompt: string): Promise<string | null> {
    if (!prompt.trim()) return Promise.resolve(null);
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a description, and you must return only the Mermaid code block that represents that description. Do not include any explanation or markdown formatting like ```mermaid ... ```.";
    return this.generateContent(prompt, systemInstruction);
  }

  explainCode(code: string): Promise<string | null> {
    if (!code.trim()) return Promise.resolve("There is no code to explain.");
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a piece of Mermaid code. Explain what the diagram represents in a clear, concise way, using markdown for formatting if needed.";
    return this.generateContent(code, systemInstruction);
  }

  fixCode(code: string, error: string): Promise<string | null> {
    if (!error.trim()) return Promise.resolve(null);
    const prompt = `The following MermaidJS code has an error.\n\nCODE:\n\`\`\`mermaid\n${code}\n\`\`\`\n\nERROR:\n${error}\n\nPlease fix the code.`;
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a piece of Mermaid code that has an error, along with the error message. Your task is to fix the code. Return only the corrected Mermaid code block, without any explanation or markdown formatting.";
    return this.generateContent(prompt, systemInstruction);
  }

  refineCode(code: string, refinePrompt: string): Promise<string | null> {
    if (!refinePrompt.trim()) return Promise.resolve(null);
    const prompt = `Here is a MermaidJS diagram. Please apply the following change: "${refinePrompt}".\n\nCODE:\n\`\`\`mermaid\n${code}\n\`\`\``;
    const systemInstruction = "You are an expert in MermaidJS. The user will provide a diagram and a requested change. Your task is to update the code to reflect the change. Return only the complete, corrected Mermaid code block, without any explanation or markdown formatting.";
    return this.generateContent(prompt, systemInstruction);
  }
}
