import { AppObject } from '../../../../NVTS-Shared-Core/packages/app-object/src/AppObject';


export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 1. Herramienta de Selección Rectangular
export class RectangleSelectionTool extends AppObject {
  private startX: number = 0;
  private startY: number = 0;

  protected onInitialize(): void {
    this.startX = 0;
    this.startY = 0;
  }

  // Cumple regla estricta: Máximo 3 subtareas operacionales por método
  public startSelection(x: number, y: number): void {
    this.setStartCoords(x, y);
    this.logAction("Rectangle selection started");
  }

  public updateSelection(currentX: number, currentY: number): SelectionBounds {
    const bounds = this.calculateBounds(currentX, currentY);
    return bounds;
  }

  private setStartCoords(x: number, y: number): void {
    this.startX = x;
    this.startY = y;
  }

  private calculateBounds(currentX: number, currentY: number): SelectionBounds {
    return {
      x: Math.min(this.startX, currentX),
      y: Math.min(this.startY, currentY),
      width: Math.abs(currentX - this.startX),
      height: Math.abs(currentY - this.startY)
    };
  }

  private logAction(msg: string): void {
    console.log(`[NVTS-PhotoMania] ${msg}`);
  }

  protected onDispose(): void {
    // Limpieza de estados atómica
  }
}

// 2. Herramienta de Selección Elíptica
export class EllipseSelectionTool extends AppObject {
  private centerX: number = 0;
  private centerY: number = 0;

  protected onInitialize(): void {
    this.centerX = 0;
    this.centerY = 0;
  }

  // Cumple regla estricta: Flujo plano de ejecución de 2 subtareas
  public startEllipse(x: number, y: number): void {
    this.setCenter(x, y);
    this.logAction("Ellipse selection started");
  }

  public calculateEllipseBounds(currentX: number, currentY: number): SelectionBounds {
    return {
      x: Math.min(this.centerX, currentX),
      y: Math.min(this.centerY, currentY),
      width: Math.abs(currentX - this.centerX) * 2, // Radio dinámico simétrico
      height: Math.abs(currentY - this.centerY) * 2
    };
  }

  private setCenter(x: number, y: number): void {
    this.centerX = x;
    this.centerY = y;
  }

  private logAction(msg: string): void {
    console.log(`[NVTS-PhotoMania] ${msg}`);
  }

  protected onDispose(): void {
    // Disposición limpia
  }
}
