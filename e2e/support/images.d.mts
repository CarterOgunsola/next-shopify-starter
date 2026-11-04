import type { DatasetImage } from "./dataset.mjs";

export const MAX_SIDE: number;
export const IMAGE_FILE: RegExp;
export function mimeType(name: string): string | null;
export function imagePath(entry: DatasetImage): string;
export function solidPng(width: number, height: number, color: string): Buffer;
export function imageBytes(
  entry: DatasetImage,
  folder?: string,
): Promise<{ type: string | null; body: Buffer }>;
export function imageResponse(
  pathname: string,
  folder?: string,
): Promise<{ status: number; type?: string | null; body?: Buffer }>;
