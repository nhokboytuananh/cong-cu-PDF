export type TextSpan = {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
};

export type PdfTextItem = {
  id: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageIndex: number;
  isModified: boolean;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  customFontFamily?: string;
  customFontSize?: number;
  customColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  offsetX?: number;
  offsetY?: number;
  hasBackground?: boolean;
  rotation?: number;
  baselineY?: number;
  spans?: TextSpan[];
};

export type Field = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'signature' | 'text';
  name: string;
  originalName?: string;
  textValue?: string;
  fontSize?: number;
};

export type PdfPage = {
  width: number;
  height: number;
  dataUrl: string;
  viewBox?: [number, number, number, number];
  pageRotation?: number;
};

export type HighlightItem = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity?: number;
  text?: string;
  isWhiteout?: boolean;
};

export type TextBoxItem = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  isBold?: boolean;
  isItalic?: boolean;
  color: string;
  textAlign?: 'left' | 'center' | 'right';
  hasBackground: boolean; // true = nền trắng (white), false = trong suốt (transparent)
  hasBorder?: boolean; // true = có viền, false = không viền
  spans?: TextSpan[];
};

export type ShapeItem = {
  id: string;
  pageIndex: number;
  type: 'rectangle' | 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  fillColor?: 'transparent' | 'light' | 'white';
};

export type PdfImageItem = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
  dataUrl: string;
};

