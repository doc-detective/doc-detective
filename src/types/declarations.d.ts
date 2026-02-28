declare module "jq-web" {
  const jq: {
    then(cb: (jq: { json(data: any, query: string): any }) => any): any;
  };
  export default jq;
}

declare module "tree-kill" {
  function kill(pid: number, signal?: string, callback?: (err?: Error) => void): void;
  export default kill;
}

declare module "@ffmpeg-installer/ffmpeg" {
  export const path: string;
  export const version: string;
  export const url: string;
}

declare module "pngjs" {
  export class PNG {
    constructor(options?: any);
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer, options?: any): PNG;
      write(png: PNG): Buffer;
    };
    parse(data: Buffer, callback?: (error: Error, data: PNG) => void): PNG;
    pack(): any;
  }
}

declare module "pixelmatch" {
  function pixelmatch(
    img1: Buffer | Uint8Array,
    img2: Buffer | Uint8Array,
    output: Buffer | Uint8Array | null,
    width: number,
    height: number,
    options?: any
  ): number;
  export default pixelmatch;
}
