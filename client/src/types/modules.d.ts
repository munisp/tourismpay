declare module "socket.io-client" {
  export function io(url: string, opts?: Record<string, unknown>): Socket;
  export interface Socket {
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    disconnect(): void;
    connect(): void;
    connected: boolean;
    id: string;
  }
  export type { Socket };
}

declare module "jsqr" {
  interface QRCode {
    data: string;
    location: {
      topLeftCorner: { x: number; y: number };
      topRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
    };
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: string },
  ): QRCode | null;
}

declare module "@mediapipe/tasks-vision" {
  export class FaceLandmarker {
    static createFromOptions(
      vision: any,
      options: Record<string, unknown>,
    ): Promise<FaceLandmarker>;
    detectForVideo(
      video: HTMLVideoElement,
      timestamp: number,
    ): { faceLandmarks: Array<Array<{ x: number; y: number; z: number }>> };
    close(): void;
  }
  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<any>;
  }
}
