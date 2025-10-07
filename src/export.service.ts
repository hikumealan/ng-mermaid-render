import { Injectable } from '@angular/core';

@Injectable()
export class ExportService {

  exportSvg(previewElement: HTMLElement) {
    const rawSvg = previewElement.querySelector('svg')?.outerHTML;
    if (!rawSvg) {
        console.error('Could not find SVG to export.');
        return;
    }
    const blob = new Blob([rawSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this.createDownloadLink(url, 'diagram.svg');
    URL.revokeObjectURL(url);
  }

  exportPng(previewElement: HTMLElement) {
    const rawSvg = previewElement.querySelector('svg')?.outerHTML;
    if (!rawSvg) {
        console.error('Could not find SVG to export.');
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Render at 2x resolution for better quality
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx?.scale(scale, scale);
      ctx?.drawImage(img, 0, 0);
      const url = canvas.toDataURL('image/png');
      this.createDownloadLink(url, 'diagram.png');
    };
    img.onerror = (e) => console.error("Failed to load SVG for PNG export", e);
    // Use btoa to handle special characters in the SVG
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(rawSvg)));
  }

  private createDownloadLink(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
