export interface UploadFile {
  buffer: Buffer | Uint8Array;
  originalname?: string;
  mimetype?: string;
  size?: number;
}
