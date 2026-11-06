/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { 
  PenSquare, Layout, FileDown, X, MousePointer2, FileUp, Loader2, FilePlus, Trash2, Type, ArrowUp, ArrowDown, Edit, HelpCircle, Info, CheckCircle2, MousePointerClick,
  RotateCcw, RotateCw, PanelLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Bold, Italic, Check, Sparkles, Highlighter, Eraser,
  AlignLeft, AlignCenter, AlignRight, Square, Circle, ShieldAlert, Lock, Undo2, Redo2, Save, ChevronDown, FolderOpen, ExternalLink, Image as ImageIcon
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfLib from 'pdf-lib';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { PageThumbnailSidebar } from './components/PageThumbnailSidebar';
import { ZoomControls } from './components/ZoomControls';
import { HighlightItem, TextBoxItem, ShapeItem, PdfImageItem, TextSpan } from './types';

// Configure pdfjs worker url
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfTextItem = {
  id: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  originalWidth?: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageIndex: number;
  isModified: boolean;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  baselineY?: number;
  // Custom Styles
  customFontFamily?: string;
  customFontSize?: number;
  customColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  offsetX?: number;
  offsetY?: number;
  hasBackground?: boolean;
  rotation?: number;
  spans?: TextSpan[];
};

const IDB_DB_NAME = 'qnpc_pdf_editor_db';
const IDB_STORE_NAME = 'active_session';

async function saveSessionToIndexedDB(sessionData: any): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
          tx.objectStore(IDB_STORE_NAME).put(sessionData, 'current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function loadSessionFromIndexedDB(): Promise<any | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
          const store = tx.objectStore(IDB_STORE_NAME);
          const getReq = store.get('current');
          getReq.onsuccess = () => {
            const res = getReq.result || null;
            if (res) {
              try { store.delete('current'); } catch {}
            }
            resolve(res);
          };
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const HIGHLIGHT_COLORS = [
  { name: 'Vàng', label: 'Vàng', hex: '#fde047', color: '#fde047', bgClass: 'bg-yellow-300' },
  { name: 'Xanh lá', label: 'Xanh lá', hex: '#86efac', color: '#86efac', bgClass: 'bg-green-300' },
  { name: 'Xanh dương', label: 'Xanh dương', hex: '#7dd3fc', color: '#7dd3fc', bgClass: 'bg-sky-300' },
  { name: 'Hồng', label: 'Hồng', hex: '#f472b6', color: '#f472b6', bgClass: 'bg-pink-400' },
  { name: 'Cam', label: 'Cam', hex: '#fdba74', color: '#fdba74', bgClass: 'bg-orange-300' },
  { name: 'Tím', label: 'Tím', hex: '#d8b4fe', color: '#d8b4fe', bgClass: 'bg-purple-300' },
];

const getIsSerif = (fontName: string): boolean => {
  const name = (fontName || '').toLowerCase();
  if (name.includes('sans') || name.includes('arial') || name.includes('helvetica') || name.includes('calibri') || name.includes('roboto') || name.includes('inter')) {
    return false;
  }
  if (name.includes('courier') || name.includes('mono') || name.includes('consolas')) {
    return false;
  }
  return true;
};

type Field = {
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

type PdfPage = {
  width: number;
  height: number;
  dataUrl: string;
  viewBox?: [number, number, number, number];
  pageRotation?: number;
};

const checkIsDigitallySigned = (_uint8Array: Uint8Array): boolean => {
  // Mở khóa hoàn toàn để tài liệu đã ký số vẫn có thể chỉnh sửa chữ và thao tác bình thường
  return false;
};

export const getCleanFontDisplayName = (fontName?: string): string => {
  const name = (fontName || '').toLowerCase();
  // Ưu tiên kiểm tra Times New Roman / Serif trước tiên (tránh bị chuỗi fallback "sans-serif" của PDF.js ghi đè thành Arial)
  if (
    name.includes('times') ||
    name.includes('roman') ||
    name.includes('tinos') ||
    name.includes('cambria') ||
    name.includes('georgia') ||
    name.includes('garamond') ||
    name.includes('palatino') ||
    name.includes('minion') ||
    name.includes('bookman') ||
    name.includes('vntime')
  ) {
    return 'Times New Roman';
  }
  if (name.includes('courier') || name.includes('mono') || name.includes('consolas')) {
    return 'Courier New';
  }
  if (name.includes('roboto')) {
    return 'Roboto';
  }
  if (
    name.includes('arial') ||
    name.includes('arimo') ||
    name.includes('helvetica') ||
    name.includes('calibri') ||
    name.includes('tahoma') ||
    name.includes('verdana') ||
    name.includes('vnarial') ||
    name.includes('segoe') ||
    name.includes('trebuchet') ||
    name.includes('opensans') ||
    name.includes('simplex') ||
    name.includes('isocp')
  ) {
    return 'Arial';
  }
  // Tiêu chuẩn hành chính VN (Nghị định 30/2020/NĐ-CP): Times New Roman
  return 'Times New Roman';
};

export const getFontFamily = (fontName?: string): string => {
  const clean = getCleanFontDisplayName(fontName);
  if (clean === 'Courier New') {
    return '"Courier New", Courier, monospace';
  }
  if (clean === 'Roboto') {
    return '"Roboto", sans-serif';
  }
  if (clean === 'Arial') {
    return 'Arial, Helvetica, "Arimo", sans-serif';
  }
  // Ưu tiên font Times New Roman chuẩn, không fallback sang Tinos gây biến dạng dấu tiếng Việt
  return '"Times New Roman", Times, "Liberation Serif", serif';
};

export function detectFontProperties(item: any, textContent: any, page: any, pdf: any) {
  let rawName = '';
  let loadedName = '';
  let isBold = false;
  let isItalic = false;

  // 1. Thử lấy từ commonObjs của trang hoặc tài liệu pdfjs
  try {
    const commonObjs = (page as any)?.commonObjs || (pdf as any)?.commonObjs;
    if (commonObjs && typeof commonObjs.has === 'function' && commonObjs.has(item.fontName)) {
      const font = commonObjs.get(item.fontName);
      if (font) {
        if (font.name) rawName = font.name;
        else if (font.fallbackName) rawName = font.fallbackName;
        if (font.loadedName) loadedName = font.loadedName;
        if (font.bold !== undefined) isBold = Boolean(font.bold);
        if (font.italic !== undefined) isItalic = Boolean(font.italic);
        if (font.black) isBold = true;
        if (font.weight && (Number(font.weight) >= 600 || font.weight === 'bold')) isBold = true;
      }
    }
  } catch (e) {
    // ignore
  }

  // 2. Lấy thêm thông tin từ textContent.styles nếu chưa có rawName
  if (!rawName && textContent?.styles?.[item.fontName]) {
    const style = textContent.styles[item.fontName];
    if (style?.fontFamily && style.fontFamily !== 'sans-serif' && style.fontFamily !== 'serif') {
      rawName = style.fontFamily;
    }
  }

  if (!rawName) {
    rawName = loadedName || item.fontName || '';
  }

  // Kiểm tra độ nghiêng hình học (italic shear) cho dòng chữ ngang
  if (Array.isArray(item.transform) && item.transform.length >= 4) {
    const rotB = Number(item.transform[1]) || 0;
    const shearX = Number(item.transform[2]) || 0;
    const scaleY = Number(item.transform[3]) || 1;
    if (Math.abs(rotB) < 0.01 && Math.abs(shearX) > Math.abs(scaleY) * 0.15) {
      isItalic = true;
    }
  }

  // Tẩy tiền tố subset ngẫu nhiên như "ABCDEF+TimesNewRomanPSMT" -> "TimesNewRomanPSMT"
  const cleanName = (rawName || '').replace(/^[A-Z]{6}\+/, '');
  const cleanLower = cleanName.toLowerCase();

  // Nhận diện chữ Đậm (Bold) chính xác theo tên phông chữ thực tế
  if (
    cleanLower.includes('bold') ||
    cleanLower.includes('black') ||
    cleanLower.includes('heavy') ||
    cleanLower.includes('semibold') ||
    cleanLower.includes('demi') ||
    /([-_,+]|^)(b|bd|bi|w7|w8|w9)([-_,+]|$|mt)/i.test(cleanName)
  ) {
    isBold = true;
  }

  // Nhận diện chữ Nghiêng (Italic) chính xác theo tên phông chữ thực tế (tránh nhầm với Identity-H, Composite, Calibri)
  if (
    cleanLower.includes('italic') ||
    cleanLower.includes('oblique') ||
    cleanLower.includes('slanted') ||
    /([-_,+]|^)(i|it|bi)([-_,+]|$|mt)/i.test(cleanName)
  ) {
    isItalic = true;
  }

  const detectedFamily = getCleanFontDisplayName(cleanName);

  return {
    rawName: cleanName || detectedFamily,
    fontFamily: detectedFamily,
    isBold,
    isItalic,
  };
}

export default function App() {
  useEffect(() => {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) {
      loadingDiv.style.display = 'none';
    }
  }, []);

  const [activeTool, setActiveTool] = useState<string>('Select');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isDigitallySigned, setIsDigitallySigned] = useState<boolean>(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [initialFieldNames, setInitialFieldNames] = useState<string[]>([]);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentName, setDocumentName] = useState('Bản nháp');
  
  const [drawing, setDrawing] = useState<{pageIndex: number, startX: number, startY: number, currentX: number, currentY: number} | null>(null);
  const [fieldInteraction, setFieldInteraction] = useState<{
    id: string;
    type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    pageIndex: number;
  } | null>(null);
  
  const [originalPdfBuffer, setOriginalPdfBuffer] = useState<Uint8Array | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const insertFileInputRef = useRef<HTMLInputElement>(null);
  
  const [insertTargetIndex, setInsertTargetIndex] = useState<number | null>(null);
  const [deletePageConfirm, setDeletePageConfirm] = useState<{index: number, dataUrl: string} | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedPageIndices, setSelectedPageIndices] = useState<number[]>([]);
  const [lastSelectedPageIndex, setLastSelectedPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const zoomRef = useRef<number>(1.0);
  const zoomAnchorRef = useRef<{
    pageIndex: number;
    pagePointX: number;
    pagePointY: number;
    anchorClientX: number;
    anchorClientY: number;
  } | null>(null);
  const [showPageSidebar, setShowPageSidebar] = useState<boolean>(true);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [pdfTexts, setPdfTexts] = useState<PdfTextItem[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [vietnameseFontBytes, setVietnameseFontBytes] = useState<Uint8Array | null>(null);

  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFilename, setExportFilename] = useState<string>('');
  const [showSignedWarningModal, setShowSignedWarningModal] = useState<boolean>(false);

  // Direct File System Access API state (Lưu trực tiếp lên tệp gốc như phần mềm cài trên máy)
  const fileHandleRef = useRef<any>(null);
  const [hasDirectFileHandle, setHasDirectFileHandle] = useState<boolean>(false);
  const [showSaveDropdown, setShowSaveDropdown] = useState<boolean>(false);
  const saveDropdownRef = useRef<HTMLDivElement>(null);
  const [saveToast, setSaveToast] = useState<{ title: string; subtitle: string } | null>(null);
  const saveToastTimerRef = useRef<number | null>(null);
  const [isInIframe] = useState<boolean>(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });
  const [pendingDirectSaveBytes, setPendingDirectSaveBytes] = useState<{ bytes: Uint8Array; filename: string } | null>(null);
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState<boolean>(false);
  const [isModalDropDragOver, setIsModalDropDragOver] = useState<boolean>(false);

  const triggerSaveToast = (title: string, subtitle: string) => {
    if (saveToastTimerRef.current) {
      window.clearTimeout(saveToastTimerRef.current);
    }
    setSaveToast({ title, subtitle });
    saveToastTimerRef.current = window.setTimeout(() => {
      setSaveToast(null);
    }, 3800);
  };

  const handleOpenInStandaloneTab = async (overrideBytes?: Uint8Array) => {
    try {
      const bufToSave = overrideBytes || originalPdfBuffer;
      if (bufToSave) {
        await saveSessionToIndexedDB({
          pdfBytes: bufToSave,
          documentName,
          highlights,
          shapes,
          fields,
          pdfTexts: overrideBytes ? [] : pdfTexts.filter(t => t.isModified),
          activeTool,
        });
      }
    } catch {}
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const handleClickOutsideSaveMenu = (e: MouseEvent) => {
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target as Node)) {
        setShowSaveDropdown(false);
      }
    };
    if (showSaveDropdown) {
      document.addEventListener('mousedown', handleClickOutsideSaveMenu);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideSaveMenu);
    };
  }, [showSaveDropdown]);

  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [activeHelpTab, setActiveHelpTab] = useState<'document' | 'fields' | 'edit_text' | 'highlights' | 'shapes' | 'export_overwrite'>('document');

  // Styling & Nudging States for PDF text edits
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showTextHighlights, setShowTextHighlights] = useState<boolean>(true);

  // Highlight annotations state
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState<string>('#fde047');
  const [highlightOpacity, setHighlightOpacity] = useState<number>(0.45);
  const [highlightToolMode, setHighlightToolMode] = useState<'highlight' | 'eraser'>('highlight');
  const [highlightInteraction, setHighlightInteraction] = useState<{
    id: string;
    type: 'drag' | 'e' | 's' | 'se';
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    pageIndex: number;
  } | null>(null);

  // Text Box (Thêm chữ) states
  const [textBoxes, setTextBoxes] = useState<TextBoxItem[]>([]);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);
  const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
  const [tbFontFamily, setTbFontFamily] = useState<string>('Times New Roman');
  const [tbFontSize, setTbFontSize] = useState<number>(12);
  const [tbLineHeight, setTbLineHeight] = useState<number>(1.25);
  const [tbIsBold, setTbIsBold] = useState<boolean>(false);
  const [tbIsItalic, setTbIsItalic] = useState<boolean>(false);
  const [tbColor, setTbColor] = useState<string>('#000000');
  const [tbTextAlign, setTbTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [tbHasBackground, setTbHasBackground] = useState<boolean>(false); // false = trong suốt, true = nền trắng
  const [tbHasBorder, setTbHasBorder] = useState<boolean>(false); // false = không viền, true = có viền
  const [deletedTextBoxes, setDeletedTextBoxes] = useState<TextBoxItem[]>([]);
  const initialLoadedTextBoxesRef = useRef<TextBoxItem[]>([]);
  const [editSelectionRange, setEditSelectionRange] = useState<{ id: string; start: number; end: number } | null>(null);
  const [tbSelectionRange, setTbSelectionRange] = useState<{ id: string; start: number; end: number } | null>(null);
  const [textBoxInteraction, setTextBoxInteraction] = useState<{
    id: string;
    type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    pageIndex: number;
  } | null>(null);

  useEffect(() => {
    if (selectedTextBoxId) {
      const tb = textBoxes.find(t => t.id === selectedTextBoxId);
      if (tb) {
        setTbFontFamily(tb.fontFamily || 'Times New Roman');
        setTbFontSize(tb.fontSize || 12);
        setTbLineHeight(tb.lineHeight || 1.25);
        setTbIsBold(!!tb.isBold);
        setTbIsItalic(!!tb.isItalic);
        setTbColor(tb.color || '#000000');
        setTbTextAlign(tb.textAlign || 'left');
        setTbHasBackground(!!tb.hasBackground);
        setTbHasBorder(!!tb.hasBorder);
      }
    } else {
      setTbSelectionRange(null);
    }
  }, [selectedTextBoxId]);

  const getNormalizedTextBoxSpans = (tb: TextBoxItem): TextSpan[] => {
    if (tb.spans && tb.spans.length > 0 && tb.spans.map(s => s.text).join('') === tb.text) {
      return tb.spans;
    }
    return [
      {
        text: tb.text,
        fontFamily: tb.fontFamily || 'Times New Roman',
        fontSize: tb.fontSize || 12,
        color: tb.color || '#000000',
        isBold: !!tb.isBold,
        isItalic: !!tb.isItalic,
      },
    ];
  };

  const reconcileTextBoxSpansWithNewText = (tb: TextBoxItem, newText: string): TextSpan[] | undefined => {
    if (!tb.spans || tb.spans.length === 0) return undefined;
    const oldText = tb.spans.map(s => s.text).join('');
    if (oldText === newText) return tb.spans;
    if (!newText) return [];

    let prefixLen = 0;
    const minLen = Math.min(oldText.length, newText.length);
    while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let oldSuffixIdx = oldText.length;
    let newSuffixIdx = newText.length;
    while (
      oldSuffixIdx > prefixLen &&
      newSuffixIdx > prefixLen &&
      oldText[oldSuffixIdx - 1] === newText[newSuffixIdx - 1]
    ) {
      oldSuffixIdx--;
      newSuffixIdx--;
    }

    const result: TextSpan[] = [];
    let pos = 0;
    let middleStyle: Omit<TextSpan, 'text'> = {
      fontFamily: tb.fontFamily || 'Times New Roman',
      fontSize: tb.fontSize || 12,
      color: tb.color || '#000000',
      isBold: !!tb.isBold,
      isItalic: !!tb.isItalic,
    };

    for (const s of tb.spans) {
      const segStart = pos;
      const segEnd = pos + s.text.length;
      if (segStart <= prefixLen && prefixLen <= segEnd) {
        middleStyle = {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          color: s.color,
          isBold: s.isBold,
          isItalic: s.isItalic,
        };
      }
      if (segStart < prefixLen) {
        const takeEnd = Math.min(segEnd, prefixLen);
        result.push({ ...s, text: s.text.slice(0, takeEnd - segStart) });
      }
      pos = segEnd;
    }

    const insertedMiddle = newText.slice(prefixLen, newSuffixIdx);
    if (insertedMiddle) {
      result.push({ ...middleStyle, text: insertedMiddle });
    }

    pos = 0;
    for (const s of tb.spans) {
      const segStart = pos;
      const segEnd = pos + s.text.length;
      if (segEnd > oldSuffixIdx) {
        const takeStart = Math.max(segStart, oldSuffixIdx);
        result.push({ ...s, text: s.text.slice(takeStart - segStart) });
      }
      pos = segEnd;
    }

    return result.filter(s => s.text.length > 0);
  };

  const wrapTextBoxSpansToLines = (tb: TextBoxItem): TextSpan[][] => {
    const spans = getNormalizedTextBoxSpans(tb);
    const maxLineW = Math.max(12, tb.width - 8);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      const canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
    } catch (e) {}

    const measureSpanTokenWidth = (seg: TextSpan): number => {
      const szPx = (seg.fontSize || tb.fontSize || 12) * 1.5;
      const ff = getFontFamily(seg.fontFamily || tb.fontFamily || 'Times New Roman');
      const b = seg.isBold ?? tb.isBold;
      const it = seg.isItalic ?? tb.isItalic;
      if (ctx) {
        ctx.font = `${it ? 'italic ' : ''}${b ? '700 ' : '400 '}${szPx}px ${ff}`;
        return ctx.measureText(seg.text).width;
      }
      return seg.text.length * (szPx * 0.52);
    };

    // Split spans into paragraphs on explicit newlines (\r?\n)
    const paragraphs: TextSpan[][] = [[]];
    for (const seg of spans) {
      const parts = (seg.text || '').split(/\r?\n/);
      for (let idx = 0; idx < parts.length; idx++) {
        if (idx > 0) {
          paragraphs.push([]);
        }
        if (parts[idx].length > 0) {
          paragraphs[paragraphs.length - 1].push({
            ...seg,
            text: parts[idx],
          });
        }
      }
    }

    const wrappedLines: TextSpan[][] = [];
    for (const para of paragraphs) {
      if (para.length === 0) {
        wrappedLines.push([]);
        continue;
      }

      // Break paragraph into word & whitespace tokens while keeping span styling
      const tokens: TextSpan[] = [];
      for (const seg of para) {
        const matches = seg.text.match(/\S+|\s+/g) || [];
        for (const m of matches) {
          tokens.push({ ...seg, text: m });
        }
      }

      let curLine: TextSpan[] = [];
      let curLineW = 0;

      for (const tk of tokens) {
        const isSpace = /^\s+$/.test(tk.text);
        if (isSpace && curLine.length === 0) {
          continue;
        }
        const tkW = measureSpanTokenWidth(tk);
        if (!isSpace && curLine.length > 0 && curLineW + tkW > maxLineW) {
          // Trim trailing whitespace token on current line
          while (curLine.length > 0 && /^\s+$/.test(curLine[curLine.length - 1].text)) {
            curLine.pop();
          }
          wrappedLines.push(curLine);
          curLine = [tk];
          curLineW = tkW;
        } else {
          curLine.push(tk);
          curLineW += tkW;
        }
      }

      if (curLine.length > 0) {
        wrappedLines.push(curLine);
      } else {
        wrappedLines.push([]);
      }
    }

    return wrappedLines.length > 0 ? wrappedLines : [[]];
  };

  const measureWrappedLinesForBox = (
    text: string,
    widthPx: number,
    fontFamily: string,
    fontSizePt: number,
    isBold?: boolean,
    isItalic?: boolean
  ): string[] => {
    const rawLines = (text || '').split(/\r?\n/);
    const maxLineW = Math.max(12, widthPx - 8);
    const screenFontPx = (fontSizePt || 12) * 1.5;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      const canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? '700 ' : '400 '}${screenFontPx}px ${getFontFamily(fontFamily || 'Times New Roman')}`;
      }
    } catch (e) {}

    const result: string[] = [];
    for (const rLine of rawLines) {
      if (!rLine) {
        result.push('');
        continue;
      }
      const words = rLine.split(' ');
      let curLine = '';
      for (const word of words) {
        const test = curLine ? `${curLine} ${word}` : word;
        const testW = ctx ? ctx.measureText(test).width : test.length * (screenFontPx * 0.52);
        if (testW > maxLineW && curLine) {
          result.push(curLine);
          curLine = word;
        } else {
          curLine = test;
        }
      }
      if (curLine) result.push(curLine);
    }
    return result.length > 0 ? result : [''];
  };

  const updateCurrentTextBox = (updates: Partial<TextBoxItem>) => {
    if (selectedTextBoxId) {
      let selStart = 0;
      let selEnd = 0;
      const el = document.getElementById(`tb-textarea-${selectedTextBoxId}`) as HTMLTextAreaElement | null;
      if (el) {
        selStart = el.selectionStart ?? 0;
        selEnd = el.selectionEnd ?? 0;
      }
      if (selStart === selEnd && tbSelectionRange && tbSelectionRange.id === selectedTextBoxId && tbSelectionRange.end > tbSelectionRange.start) {
        selStart = tbSelectionRange.start;
        selEnd = tbSelectionRange.end;
      }

      const hasFormattingUpdate =
        updates.fontFamily !== undefined ||
        updates.fontSize !== undefined ||
        updates.color !== undefined ||
        updates.isBold !== undefined ||
        updates.isItalic !== undefined;

      setTextBoxes(prev => prev.map(tb => {
        if (tb.id !== selectedTextBoxId) return tb;

        // 1. If text itself is updated (typing in textarea), reconcile existing spans
        if (updates.text !== undefined) {
          const reconciledSpans = reconcileTextBoxSpansWithNewText(tb, updates.text);
          const nextTb: TextBoxItem = { ...tb, ...updates, spans: reconciledSpans };
          const spanLines = wrapTextBoxSpansToLines(nextTb);
          const maxSpanSizePt = Math.max(
            nextTb.fontSize || 12,
            ...(reconciledSpans || []).map(s => s.fontSize || nextTb.fontSize || 12)
          );
          const screenFontPx = maxSpanSizePt * 1.5;
          const lh = nextTb.lineHeight || 1.25;
          const minNeededHeight = Math.ceil(spanLines.length * screenFontPx * lh + 10);
          if (updates.height === undefined && minNeededHeight > nextTb.height) {
            nextTb.height = minNeededHeight;
          }
          return nextTb;
        }

        // 2. If user highlighted a specific segment [selStart, selEnd], apply style ONLY to that segment!
        if (hasFormattingUpdate && selEnd > selStart && selStart >= 0 && selEnd <= tb.text.length) {
          const baseSpans = getNormalizedTextBoxSpans(tb);
          const newSpans: TextSpan[] = [];
          let pos = 0;
          for (const seg of baseSpans) {
            const segStart = pos;
            const segEnd = pos + seg.text.length;
            if (segEnd <= selStart || segStart >= selEnd) {
              newSpans.push({ ...seg });
            } else {
              if (segStart < selStart) {
                newSpans.push({ ...seg, text: seg.text.slice(0, selStart - segStart) });
              }
              const midStart = Math.max(segStart, selStart);
              const midEnd = Math.min(segEnd, selEnd);
              const updatedSeg: TextSpan = {
                ...seg,
                text: seg.text.slice(midStart - segStart, midEnd - segStart),
              };
              if (updates.fontFamily !== undefined) updatedSeg.fontFamily = updates.fontFamily;
              if (updates.fontSize !== undefined) updatedSeg.fontSize = updates.fontSize;
              if (updates.color !== undefined) updatedSeg.color = updates.color;
              if (updates.isBold !== undefined) updatedSeg.isBold = updates.isBold;
              if (updates.isItalic !== undefined) updatedSeg.isItalic = updates.isItalic;
              newSpans.push(updatedSeg);

              if (segEnd > selEnd) {
                newSpans.push({ ...seg, text: seg.text.slice(selEnd - segStart) });
              }
            }
            pos = segEnd;
          }

          // Merge adjacent identical spans
          const merged: TextSpan[] = [];
          for (const s of newSpans) {
            if (!s.text) continue;
            const prevSpan = merged.length > 0 ? merged[merged.length - 1] : null;
            if (
              prevSpan &&
              prevSpan.fontFamily === s.fontFamily &&
              Math.abs((prevSpan.fontSize || 12) - (s.fontSize || 12)) < 0.05 &&
              (prevSpan.color || '#000000').toLowerCase() === (s.color || '#000000').toLowerCase() &&
              !!prevSpan.isBold === !!s.isBold &&
              !!prevSpan.isItalic === !!s.isItalic
            ) {
              prevSpan.text += s.text;
            } else {
              merged.push({ ...s });
            }
          }

          const nextTb: TextBoxItem = {
            ...tb,
            spans: merged,
            ...(updates.lineHeight !== undefined ? { lineHeight: updates.lineHeight } : {}),
            ...(updates.textAlign !== undefined ? { textAlign: updates.textAlign } : {}),
            ...(updates.hasBackground !== undefined ? { hasBackground: updates.hasBackground } : {}),
            ...(updates.hasBorder !== undefined ? { hasBorder: updates.hasBorder } : {}),
            ...(updates.width !== undefined ? { width: updates.width } : {}),
            ...(updates.height !== undefined ? { height: updates.height } : {}),
          };
          const spanLines = wrapTextBoxSpansToLines(nextTb);
          const maxSpanSizePt = Math.max(
            nextTb.fontSize || 12,
            ...merged.map(s => s.fontSize || nextTb.fontSize || 12)
          );
          const screenFontPx = maxSpanSizePt * 1.5;
          const lh = nextTb.lineHeight || 1.25;
          const minNeededHeight = Math.ceil(spanLines.length * screenFontPx * lh + 10);
          if (updates.height === undefined && minNeededHeight > nextTb.height) {
            nextTb.height = minNeededHeight;
          }
          return nextTb;
        }

        // 3. No segment selected: apply to whole TextBox and synchronize all spans
        let updatedSpans = tb.spans;
        if (updatedSpans && updatedSpans.length > 0 && hasFormattingUpdate) {
          updatedSpans = updatedSpans.map(seg => ({
            ...seg,
            ...(updates.fontFamily !== undefined ? { fontFamily: updates.fontFamily } : {}),
            ...(updates.fontSize !== undefined ? { fontSize: updates.fontSize } : {}),
            ...(updates.color !== undefined ? { color: updates.color } : {}),
            ...(updates.isBold !== undefined ? { isBold: updates.isBold } : {}),
            ...(updates.isItalic !== undefined ? { isItalic: updates.isItalic } : {}),
          }));
        }

        const nextTb: TextBoxItem = { ...tb, ...updates, spans: updatedSpans };
        if (updates.lineHeight !== undefined || updates.fontSize !== undefined || updates.width !== undefined) {
          const spanLines = wrapTextBoxSpansToLines(nextTb);
          const maxSpanSizePt = Math.max(
            nextTb.fontSize || 12,
            ...(updatedSpans || []).map(s => s.fontSize || nextTb.fontSize || 12)
          );
          const screenFontPx = maxSpanSizePt * 1.5;
          const lh = nextTb.lineHeight || 1.25;
          const minNeededHeight = Math.ceil(spanLines.length * screenFontPx * lh + 10);
          if (updates.height === undefined && minNeededHeight > nextTb.height) {
            nextTb.height = minNeededHeight;
          }
        }
        return nextTb;
      }));

      // Restore selection in textarea if user formatted a highlighted segment
      if (selEnd > selStart) {
        setTbSelectionRange({ id: selectedTextBoxId, start: selStart, end: selEnd });
        if (el) {
          requestAnimationFrame(() => {
            try {
              el.focus();
              el.setSelectionRange(selStart, selEnd);
            } catch {}
          });
        }
        return;
      }
    }
    if (updates.fontFamily !== undefined) setTbFontFamily(updates.fontFamily);
    if (updates.fontSize !== undefined) setTbFontSize(updates.fontSize);
    if (updates.lineHeight !== undefined) setTbLineHeight(updates.lineHeight);
    if (updates.isBold !== undefined) setTbIsBold(updates.isBold);
    if (updates.isItalic !== undefined) setTbIsItalic(updates.isItalic);
    if (updates.color !== undefined) setTbColor(updates.color);
    if (updates.textAlign !== undefined) setTbTextAlign(updates.textAlign);
    if (updates.hasBackground !== undefined) setTbHasBackground(updates.hasBackground);
    if (updates.hasBorder !== undefined) setTbHasBorder(updates.hasBorder);
  };

  // Shapes state (Kẻ ô vuông & Khoanh vùng trong PDF)
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [shapeType, setShapeType] = useState<'rectangle' | 'circle'>('rectangle');
  const [shapeStrokeColor, setShapeStrokeColor] = useState<string>('#ef4444');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(2);
  const [shapeStrokeStyle, setShapeStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [shapeFill, setShapeFill] = useState<'transparent' | 'light' | 'white'>('transparent');
  const [shapeInteraction, setShapeInteraction] = useState<{
    id: string;
    type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    pageIndex: number;
  } | null>(null);

  const [images, setImages] = useState<PdfImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageInteraction, setImageInteraction] = useState<{
    id: string;
    type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
    pageIndex: number;
    aspectRatio: number;
  } | null>(null);

  useEffect(() => {
    if (selectedShapeId) {
      const sh = shapes.find(s => s.id === selectedShapeId);
      if (sh) {
        setShapeType(sh.type);
        setShapeStrokeColor(sh.strokeColor || '#ef4444');
        setShapeStrokeWidth(sh.strokeWidth || 2);
        setShapeStrokeStyle(sh.strokeStyle || 'solid');
        setShapeFill(sh.fillColor || 'transparent');
      }
    }
  }, [selectedShapeId]);

  const updateCurrentShape = (updates: Partial<ShapeItem>) => {
    if (selectedShapeId) {
      setShapes(prev => prev.map(s => s.id === selectedShapeId ? { ...s, ...updates } : s));
    }
    if (updates.type !== undefined) setShapeType(updates.type);
    if (updates.strokeColor !== undefined) setShapeStrokeColor(updates.strokeColor);
    if (updates.strokeWidth !== undefined) setShapeStrokeWidth(updates.strokeWidth);
    if (updates.strokeStyle !== undefined) setShapeStrokeStyle(updates.strokeStyle);
    if (updates.fillColor !== undefined) setShapeFill(updates.fillColor);
  };

  useEffect(() => {
    if (documentName && pages.length > 0 && !isProcessing) {
      try {
        localStorage.setItem(`pdf_shapes_${documentName}`, JSON.stringify(shapes));
      } catch (e) {}
    }
  }, [shapes, documentName, pages.length, isProcessing]);

  useEffect(() => {
    if (documentName && pages.length > 0 && !isProcessing) {
      try {
        localStorage.setItem(`pdf_highlights_${documentName}`, JSON.stringify(highlights));
      } catch (e) {}
    }
  }, [highlights, documentName, pages.length, isProcessing]);

  // Undo / Redo History Stack for Shapes, Highlights, TextBoxes, and Images
  type AnnotationSnapshot = {
    shapes: ShapeItem[];
    highlights: HighlightItem[];
    textBoxes: TextBoxItem[];
    deletedTextBoxes: TextBoxItem[];
    images: PdfImageItem[];
  };

  const [undoStack, setUndoStack] = useState<AnnotationSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationSnapshot[]>([]);
  const committedSnapshotRef = useRef<AnnotationSnapshot>({
    shapes: [],
    highlights: [],
    textBoxes: [],
    deletedTextBoxes: [],
    images: [],
  });
  const isUndoingOrRedoingRef = useRef<boolean>(false);

  const cloneSnapshot = (snap: AnnotationSnapshot): AnnotationSnapshot => ({
    shapes: snap.shapes.map(s => ({ ...s })),
    highlights: snap.highlights.map(h => ({ ...h })),
    textBoxes: snap.textBoxes.map(t => ({ ...t })),
    deletedTextBoxes: snap.deletedTextBoxes.map(d => ({ ...d })),
    images: (snap.images || []).map(img => ({ ...img })),
  });

  const isSameSnapshot = (a: AnnotationSnapshot, b: AnnotationSnapshot): boolean => {
    if (
      a.shapes.length !== b.shapes.length ||
      a.highlights.length !== b.highlights.length ||
      a.textBoxes.length !== b.textBoxes.length ||
      a.deletedTextBoxes.length !== b.deletedTextBoxes.length ||
      (a.images?.length || 0) !== (b.images?.length || 0)
    ) {
      return false;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  };

  useEffect(() => {
    const currentSnap: AnnotationSnapshot = {
      shapes,
      highlights,
      textBoxes,
      deletedTextBoxes,
      images,
    };

    if (isProcessing) {
      committedSnapshotRef.current = cloneSnapshot(currentSnap);
      return;
    }

    if (isUndoingOrRedoingRef.current) {
      isUndoingOrRedoingRef.current = false;
      committedSnapshotRef.current = cloneSnapshot(currentSnap);
      return;
    }

    // Defer history commit while user is actively dragging or resizing
    if (shapeInteraction !== null || highlightInteraction !== null || textBoxInteraction !== null || imageInteraction !== null) {
      return;
    }

    if (isSameSnapshot(committedSnapshotRef.current, currentSnap)) {
      return;
    }

    // Debounce commit while typing inside a TextBox so typing a phrase is one undo step
    if (editingTextBoxId !== null) {
      const timer = setTimeout(() => {
        if (!isSameSnapshot(committedSnapshotRef.current, currentSnap)) {
          const prevCommitted = cloneSnapshot(committedSnapshotRef.current);
          setUndoStack(prev => [...prev.slice(-49), prevCommitted]);
          setRedoStack([]);
          committedSnapshotRef.current = cloneSnapshot(currentSnap);
        }
      }, 400);
      return () => clearTimeout(timer);
    }

    const prevCommitted = cloneSnapshot(committedSnapshotRef.current);
    setUndoStack(prev => [...prev.slice(-49), prevCommitted]);
    setRedoStack([]);
    committedSnapshotRef.current = cloneSnapshot(currentSnap);
  }, [shapes, highlights, textBoxes, deletedTextBoxes, images, shapeInteraction, highlightInteraction, textBoxInteraction, imageInteraction, editingTextBoxId, isProcessing]);

  const applyAnnotationSnapshot = (snap: AnnotationSnapshot) => {
    isUndoingOrRedoingRef.current = true;
    committedSnapshotRef.current = cloneSnapshot(snap);
    setShapes(snap.shapes.map(s => ({ ...s })));
    setHighlights(snap.highlights.map(h => ({ ...h })));
    setTextBoxes(snap.textBoxes.map(t => ({ ...t })));
    setDeletedTextBoxes(snap.deletedTextBoxes.map(d => ({ ...d })));
    setImages((snap.images || []).map(img => ({ ...img })));

    if (selectedShapeId && !snap.shapes.some(s => s.id === selectedShapeId)) {
      setSelectedShapeId(null);
    }
    if (selectedHighlightId && !snap.highlights.some(h => h.id === selectedHighlightId)) {
      setSelectedHighlightId(null);
    }
    if (selectedTextBoxId && !snap.textBoxes.some(t => t.id === selectedTextBoxId)) {
      setSelectedTextBoxId(null);
      setEditingTextBoxId(null);
    }
    if (selectedImageId && !(snap.images || []).some(img => img.id === selectedImageId)) {
      setSelectedImageId(null);
    }
  };

  const handleUndo = () => {
    if (isDigitallySigned || isProcessing) return;
    const currentSnap: AnnotationSnapshot = {
      shapes,
      highlights,
      textBoxes,
      deletedTextBoxes,
      images,
    };

    if (!isSameSnapshot(committedSnapshotRef.current, currentSnap)) {
      const target = cloneSnapshot(committedSnapshotRef.current);
      setRedoStack(prev => [...prev.slice(-49), cloneSnapshot(currentSnap)]);
      applyAnnotationSnapshot(target);
      return;
    }

    if (undoStack.length === 0) return;
    const target = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev.slice(-49), cloneSnapshot(currentSnap)]);
    applyAnnotationSnapshot(target);
  };

  const handleRedo = () => {
    if (isDigitallySigned || isProcessing || redoStack.length === 0) return;
    const currentSnap: AnnotationSnapshot = {
      shapes,
      highlights,
      textBoxes,
      deletedTextBoxes,
      images,
    };
    const target = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev.slice(-49), cloneSnapshot(currentSnap)]);
    applyAnnotationSnapshot(target);
  };

  const canUndo = !isDigitallySigned && (
    undoStack.length > 0 ||
    !isSameSnapshot(committedSnapshotRef.current, { shapes, highlights, textBoxes, deletedTextBoxes, images })
  );
  const canRedo = !isDigitallySigned && redoStack.length > 0;

  // Lazy-loaded high-quality Vietnamese fonts
  const [fontSerifRegular, setFontSerifRegular] = useState<Uint8Array | null>(null);
  const [fontSerifBold, setFontSerifBold] = useState<Uint8Array | null>(null);
  const [fontSerifItalic, setFontSerifItalic] = useState<Uint8Array | null>(null);
  const [fontSerifBoldItalic, setFontSerifBoldItalic] = useState<Uint8Array | null>(null);
  const [fontSansRegular, setFontSansRegular] = useState<Uint8Array | null>(null);
  const [fontSansBold, setFontSansBold] = useState<Uint8Array | null>(null);
  const [fontSansItalic, setFontSansItalic] = useState<Uint8Array | null>(null);
  const [fontSansBoldItalic, setFontSansBoldItalic] = useState<Uint8Array | null>(null);

  const [fontsLoading, setFontsLoading] = useState<boolean>(false);
  const [fontsLoaded, setFontsLoaded] = useState<boolean>(false);
  const fontsLoadingPromiseRef = useRef<Promise<{
    serifRegular: Uint8Array | null;
    serifBold: Uint8Array | null;
    serifItalic: Uint8Array | null;
    serifBoldItalic: Uint8Array | null;
    sansRegular: Uint8Array | null;
    sansBold: Uint8Array | null;
    sansItalic: Uint8Array | null;
    sansBoldItalic: Uint8Array | null;
  }> | null>(null);

  const fontsRef = useRef<{
    serifRegular: Uint8Array | null;
    serifBold: Uint8Array | null;
    serifItalic: Uint8Array | null;
    serifBoldItalic: Uint8Array | null;
    sansRegular: Uint8Array | null;
    sansBold: Uint8Array | null;
    sansItalic: Uint8Array | null;
    sansBoldItalic: Uint8Array | null;
  }>({
    serifRegular: null,
    serifBold: null,
    serifItalic: null,
    serifBoldItalic: null,
    sansRegular: null,
    sansBold: null,
    sansItalic: null,
    sansBoldItalic: null,
  });

  const ensureFontsLoaded = async () => {
    if (
      fontsLoaded &&
      fontsRef.current.serifRegular &&
      fontsRef.current.serifItalic &&
      fontsRef.current.serifBoldItalic
    ) {
      return fontsRef.current;
    }
    if (fontsLoadingPromiseRef.current) {
      return await fontsLoadingPromiseRef.current;
    }

    let resolvePromise: (val: any) => void = () => {};
    fontsLoadingPromiseRef.current = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    setFontsLoading(true);
    try {
      const loadFontWithFallbacks = async (urls: string[]) => {
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              return new Uint8Array(buf);
            }
          } catch (e) {
            console.warn(`Failed to load font from ${url}, trying next fallback...`, e);
          }
        }
        return null;
      };

      const serifRegularUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/times.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/times.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Regular.ttf'
      ];
      const serifBoldUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/timesbd.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/timesbd.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Bold.ttf'
      ];
      const serifItalicUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/timesi.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/timesi.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Italic.ttf'
      ];
      const serifBoldItalicUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/timesbi.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/timesbi.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-BoldItalic.ttf'
      ];

      const sansRegularUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/arial.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/arial.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo%5Bwght%5D.ttf'
      ];
      const sansBoldUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/arialbd.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/arialbd.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo%5Bwght%5D.ttf'
      ];
      const sansItalicUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/ariali.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/ariali.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo%5Bwght%5D.ttf'
      ];
      const sansBoldItalicUrls = [
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/arialbi.ttf',
        'https://raw.githubusercontent.com/codxse/linux-mandatory-font/master/mac-fonts/arialbi.ttf',
        'https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/ariali.ttf'
      ];

      const [sr, sb, si, sbi, sar, sab, sai, sabi] = await Promise.all([
        loadFontWithFallbacks(serifRegularUrls),
        loadFontWithFallbacks(serifBoldUrls),
        loadFontWithFallbacks(serifItalicUrls),
        loadFontWithFallbacks(serifBoldItalicUrls),
        loadFontWithFallbacks(sansRegularUrls),
        loadFontWithFallbacks(sansBoldUrls),
        loadFontWithFallbacks(sansItalicUrls),
        loadFontWithFallbacks(sansBoldItalicUrls)
      ]);

      if (sr) { setFontSerifRegular(sr); fontsRef.current.serifRegular = sr; }
      if (sb) { setFontSerifBold(sb); fontsRef.current.serifBold = sb; }
      if (si) { setFontSerifItalic(si); fontsRef.current.serifItalic = si; }
      if (sbi) { setFontSerifBoldItalic(sbi); fontsRef.current.serifBoldItalic = sbi; }
      if (sar) { setFontSansRegular(sar); fontsRef.current.sansRegular = sar; }
      if (sab) { setFontSansBold(sab); fontsRef.current.sansBold = sab; }
      if (sai) { setFontSansItalic(sai); fontsRef.current.sansItalic = sai; }
      if (sabi) { setFontSansBoldItalic(sabi); fontsRef.current.sansBoldItalic = sabi; }

      setFontsLoaded(true);
      console.log('All Vietnamese fonts loaded successfully.');
      return fontsRef.current;
    } catch (err) {
      console.error('Error loading fonts:', err);
      return fontsRef.current;
    } finally {
      setFontsLoading(false);
      resolvePromise(fontsRef.current);
      fontsLoadingPromiseRef.current = null;
    }
  };

  useEffect(() => {
    // Pre-load all Vietnamese fonts in the background immediately on app mount
    ensureFontsLoaded();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const activeTag = document.activeElement?.tagName ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'select' || (activeTag === 'textarea' && editingTextId)) {
          return;
        }
        const keyLower = e.key.toLowerCase();
        if (keyLower === 's') {
          e.preventDefault();
          if (originalPdfBuffer && !isProcessing) {
            handleDirectSave(false);
          }
          return;
        }
        if (keyLower === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
          return;
        }
        if (keyLower === 'y' || (keyLower === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
          return;
        }
      }

      if (e.key === 'Escape') {
        setActiveTool('Select');
        setSelectedFieldId(null);
        setSelectedTextId(null);
        setSelectedHighlightId(null);
        setSelectedTextBoxId(null);
        setEditingTextBoxId(null);
        setSelectedShapeId(null);
        setSelectedImageId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !editingTextId && !editingTextBoxId) {
        const activeTag = document.activeElement?.tagName ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
        if (selectedImageId) {
          e.preventDefault();
          setImages(prev => prev.filter(img => img.id !== selectedImageId));
          setSelectedImageId(null);
        } else if (selectedShapeId) {
          e.preventDefault();
          setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
          setSelectedShapeId(null);
        } else if (selectedTextBoxId) {
          e.preventDefault();
          const deletedItem = textBoxes.find(tb => tb.id === selectedTextBoxId);
          if (deletedItem && initialLoadedTextBoxesRef.current.some(itb => itb.id === deletedItem.id)) {
            setDeletedTextBoxes(prev => [...prev, deletedItem]);
          }
          setTextBoxes(prev => prev.filter(tb => tb.id !== selectedTextBoxId));
          setSelectedTextBoxId(null);
        } else if (selectedHighlightId) {
          e.preventDefault();
          setHighlights(prev => prev.filter(h => h.id !== selectedHighlightId));
          setSelectedHighlightId(null);
        } else if (selectedFieldId) {
          e.preventDefault();
          deleteField(selectedFieldId);
          setSelectedFieldId(null);
        }
      } else if (selectedImageId && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const activeTag = document.activeElement?.tagName ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        setImages(prev => prev.map(img => {
          if (img.id !== selectedImageId) return img;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowUp') dy = -delta;
          if (e.key === 'ArrowDown') dy = delta;
          if (e.key === 'ArrowLeft') dx = -delta;
          if (e.key === 'ArrowRight') dx = delta;
          return { ...img, x: Math.max(0, img.x + dx), y: Math.max(0, img.y + dy) };
        }));
      } else if (selectedShapeId && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const activeTag = document.activeElement?.tagName ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        setShapes(prev => prev.map(s => {
          if (s.id !== selectedShapeId) return s;
          let dx = 0;
          let dy = 0;
          if (e.key === 'ArrowUp') dy = -delta;
          if (e.key === 'ArrowDown') dy = delta;
          if (e.key === 'ArrowLeft') dx = -delta;
          if (e.key === 'ArrowRight') dx = delta;
          return { ...s, x: Math.max(0, s.x + dx), y: Math.max(0, s.y + dy) };
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingTextId, editingTextBoxId, selectedHighlightId, selectedFieldId, selectedTextBoxId, selectedShapeId, textBoxes, shapes, highlights, deletedTextBoxes, undoStack, redoStack, isDigitallySigned, isProcessing]);

  useEffect(() => {
    if (documentName && documentName !== 'Bản nháp') {
      try {
        localStorage.setItem(`pdf_highlights_${documentName}`, JSON.stringify(highlights));
      } catch (e) {
        // ignore storage quota errors
      }
    }
  }, [highlights, documentName]);

  useEffect(() => {
    const loadFont = async () => {
      try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/times.ttf');
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          setVietnameseFontBytes(new Uint8Array(buffer));
          console.log("Vietnamese Times New Roman font loaded successfully.");
        } else {
          // fallback to Arial
          const resp2 = await fetch('https://cdn.jsdelivr.net/gh/codxse/linux-mandatory-font@master/mac-fonts/arial.ttf');
          if (resp2.ok) {
            const buffer = await resp2.arrayBuffer();
            setVietnameseFontBytes(new Uint8Array(buffer));
            console.log("Vietnamese font (Arial fallback) loaded.");
          }
        }
      } catch (err) {
        console.error("Failed to load Times New Roman font from CDN:", err);
      }
    };
    loadFont();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
     if (pages.length === 0) return;
     const container = e.currentTarget;
     const containerTop = container.getBoundingClientRect().top;
     const containerCenter = containerTop + container.clientHeight / 2;
     
     let closestPage = 1;
     let minDistance = Infinity;
     
     for (let i = 0; i < pages.length; i++) {
        const el = document.getElementById(`page-${i}`);
        if (el) {
           const rect = el.getBoundingClientRect();
           const pageCenter = rect.top + rect.height / 2;
           const distance = Math.abs(containerCenter - pageCenter);
           if (distance < minDistance) {
              minDistance = distance;
              closestPage = i + 1;
           }
        }
     }
     if (currentPage !== closestPage) {
        setCurrentPage(closestPage);
     }
  };

  const captureZoomAnchor = (clientX: number, clientY: number, baseZoom: number) => {
    const container = workspaceRef.current;
    if (!container) return;
    const pageEls = container.querySelectorAll<HTMLElement>('[data-page-index]');
    if (pageEls.length === 0) return;

    let bestEl: HTMLElement | null = null;
    let bestIdx = 0;
    let minDistance = Infinity;

    pageEls.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-page-index') || '0', 10);
      const rect = el.getBoundingClientRect();
      const vDist =
        clientY >= rect.top && clientY <= rect.bottom
          ? 0
          : Math.min(Math.abs(clientY - rect.top), Math.abs(clientY - rect.bottom));
      const hDist =
        clientX >= rect.left && clientX <= rect.right
          ? 0
          : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
      const totalDist = vDist * 10 + hDist;
      if (totalDist < minDistance) {
        minDistance = totalDist;
        bestEl = el;
        bestIdx = idx;
      }
    });

    if (!bestEl) return;
    const rect = (bestEl as HTMLElement).getBoundingClientRect();
    const clampedClientX = Math.min(Math.max(clientX, rect.left), rect.right);
    const clampedClientY = Math.min(Math.max(clientY, rect.top), rect.bottom);

    const pagePointX = (clampedClientX - rect.left) / baseZoom;
    const pagePointY = (clampedClientY - rect.top) / baseZoom;

    zoomAnchorRef.current = {
      pageIndex: bestIdx,
      pagePointX,
      pagePointY,
      anchorClientX: clampedClientX,
      anchorClientY: clampedClientY,
    };
  };

  const applyZoomWithCenterAnchor = (nextZoomRaw: number) => {
    const nextZoom = Math.min(Math.max(Math.round(nextZoomRaw * 100) / 100, 0.25), 3.0);
    if (nextZoom === zoomRef.current) return;
    const container = workspaceRef.current;
    if (container && !zoomAnchorRef.current) {
      const cRect = container.getBoundingClientRect();
      captureZoomAnchor(
        cRect.left + cRect.width / 2,
        cRect.top + cRect.height / 2,
        zoomRef.current
      );
    }
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  };

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const anchor = zoomAnchorRef.current;
    const container = workspaceRef.current;
    if (!anchor || !container) return;
    zoomAnchorRef.current = null;

    const pageEl = container.querySelector<HTMLElement>(`[data-page-index="${anchor.pageIndex}"]`);
    if (!pageEl) return;

    const newRect = pageEl.getBoundingClientRect();
    const newScreenX = newRect.left + anchor.pagePointX * zoom;
    const newScreenY = newRect.top + anchor.pagePointY * zoom;

    container.scrollLeft += newScreenX - anchor.anchorClientX;
    container.scrollTop += newScreenY - anchor.anchorClientY;

    if (pages.length > 0 && currentPage !== anchor.pageIndex + 1) {
      setCurrentPage(anchor.pageIndex + 1);
    }
  }, [zoom]);

  // Wheel zoom with Ctrl or Cmd anchored at the mouse cursor
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container) return;
    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const currentZ = zoomRef.current;
        const nextZoom = Math.min(Math.max(Math.round((currentZ + delta) * 100) / 100, 0.25), 3.0);
        if (nextZoom === currentZ) return;

        if (!zoomAnchorRef.current) {
          captureZoomAnchor(e.clientX, e.clientY, currentZ);
        }
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
      }
    };
    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  const handleFitWidth = () => {
    if (!workspaceRef.current) return;
    const targetPage = pages[currentPage - 1] || pages[0];
    const pageWidth = targetPage ? targetPage.width : 800;
    const availableWidth = workspaceRef.current.clientWidth - 96;
    if (availableWidth > 100) {
      const calculatedZoom = Math.round((availableWidth / pageWidth) * 100) / 100;
      applyZoomWithCenterAnchor(calculatedZoom);
    }
  };

  const handleFitPage = () => {
    if (!workspaceRef.current) return;
    const targetPage = pages[currentPage - 1] || pages[0];
    const pageHeight = targetPage ? targetPage.height : 1131;
    const availableHeight = workspaceRef.current.clientHeight - 96;
    if (availableHeight > 100) {
      const calculatedZoom = Math.round((availableHeight / pageHeight) * 100) / 100;
      applyZoomWithCenterAnchor(calculatedZoom);
    }
  };

  const handleResetZoom = () => {
    applyZoomWithCenterAnchor(1.0);
  };

  const handleScrollToPage = (index: number) => {
    const el = document.getElementById(`page-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(index + 1);
    }
  };

  const handleRotatePages = async (indices: number[], deltaDegrees: number) => {
    if (!originalPdfBuffer || indices.length === 0) return;
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Việc xoay trang đã bị khóa để tránh làm hỏng chữ ký số.");
      return;
    }

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      indices.forEach((idx) => {
        if (idx >= 0 && idx < pdfDoc.getPageCount()) {
          const page = pdfDoc.getPage(idx);
          const currentAngle = page.getRotation().angle;
          let nextAngle = (currentAngle + deltaDegrees) % 360;
          if (nextAngle < 0) nextAngle += 360;
          page.setRotation(pdfLib.degrees(nextAngle));
        }
      });

      // Update existing overlays on rotated pages so they stay aligned with the page content
      const normDelta = (deltaDegrees % 360 + 360) % 360;
      if (normDelta !== 0) {
        setTextBoxes(prev => prev.map(tb => {
          if (!indices.includes(tb.pageIndex)) return tb;
          const p = pages[tb.pageIndex];
          if (!p) return tb;
          const W = p.width;
          const H = p.height;
          if (normDelta === 90) {
            return {
              ...tb,
              x: H - (tb.y + tb.height),
              y: tb.x,
              width: tb.height,
              height: tb.width,
            };
          } else if (normDelta === 270) {
            return {
              ...tb,
              x: tb.y,
              y: W - (tb.x + tb.width),
              width: tb.height,
              height: tb.width,
            };
          } else if (normDelta === 180) {
            return {
              ...tb,
              x: W - (tb.x + tb.width),
              y: H - (tb.y + tb.height),
            };
          }
          return tb;
        }));

        setHighlights(prev => prev.map(hl => {
          if (!indices.includes(hl.pageIndex)) return hl;
          const p = pages[hl.pageIndex];
          if (!p) return hl;
          const W = p.width;
          const H = p.height;
          if (normDelta === 90) {
            return {
              ...hl,
              x: H - (hl.y + hl.height),
              y: hl.x,
              width: hl.height,
              height: hl.width,
            };
          } else if (normDelta === 270) {
            return {
              ...hl,
              x: hl.y,
              y: W - (hl.x + hl.width),
              width: hl.height,
              height: hl.width,
            };
          } else if (normDelta === 180) {
            return {
              ...hl,
              x: W - (hl.x + hl.width),
              y: H - (hl.y + hl.height),
            };
          }
          return hl;
        }));

        setFields(prev => prev.map(f => {
          if (!indices.includes(f.pageIndex)) return f;
          const p = pages[f.pageIndex];
          if (!p) return f;
          const W = p.width;
          const H = p.height;
          if (normDelta === 90) {
            return {
              ...f,
              x: H - (f.y + f.height),
              y: f.x,
              width: f.height,
              height: f.width,
            };
          } else if (normDelta === 270) {
            return {
              ...f,
              x: f.y,
              y: W - (f.x + f.width),
              width: f.height,
              height: f.width,
            };
          } else if (normDelta === 180) {
            return {
              ...f,
              x: W - (f.x + f.width),
              y: H - (f.y + f.height),
            };
          }
          return f;
        }));

        setShapes(prev => prev.map(sh => {
          if (!indices.includes(sh.pageIndex)) return sh;
          const p = pages[sh.pageIndex];
          if (!p) return sh;
          const W = p.width;
          const H = p.height;
          if (normDelta === 90) {
            return {
              ...sh,
              x: H - (sh.y + sh.height),
              y: sh.x,
              width: sh.height,
              height: sh.width,
            };
          } else if (normDelta === 270) {
            return {
              ...sh,
              x: sh.y,
              y: W - (sh.x + sh.width),
              width: sh.height,
              height: sh.width,
            };
          } else if (normDelta === 180) {
            return {
              ...sh,
              x: W - (sh.x + sh.width),
              y: H - (sh.y + sh.height),
            };
          }
          return sh;
        }));
      }

      const newPdfBytes = await pdfDoc.save();
      setOriginalPdfBuffer(newPdfBytes);
      await renderPdfPages(newPdfBytes);
    } catch (err) {
      console.error('Error rotating pages:', err);
      alert('Không thể xoay trang.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getPageEffectiveDimensions = (page: any) => {
    const { width, height } = page.getSize();
    let visibleWidth = width;
    let visibleHeight = height;
    let boxX = 0;
    let boxY = 0;
    try {
      const cropBox = page.getCropBox();
      if (cropBox) {
        boxX = cropBox.x || 0;
        boxY = cropBox.y || 0;
        visibleWidth = cropBox.width;
        visibleHeight = cropBox.height;
      }
    } catch (e) {
      console.error("Error getting cropbox", e);
    }
    return { boxX, boxY, visibleWidth, visibleHeight };
  };

  const getPageTransformMatrix = (
    viewBox: [number, number, number, number],
    rotation: number
  ) => {
    const centerX = (viewBox[2] + viewBox[0]) / 2.0;
    const centerY = (viewBox[3] + viewBox[1]) / 2.0;
    let rot = (rotation % 360 + 360) % 360;
    let rA = 1, rB = 0, rC = 0, rD = -1;
    if (rot === 180) {
      rA = -1; rB = 0; rC = 0; rD = 1;
    } else if (rot === 90) {
      rA = 0; rB = 1; rC = 1; rD = 0;
    } else if (rot === 270) {
      rA = 0; rB = -1; rC = -1; rD = 0;
    }

    let offsetX = 0, offsetY = 0, width = 0, height = 0;
    if (rA === 0) {
      offsetX = Math.abs(centerY - viewBox[1]);
      offsetY = Math.abs(centerX - viewBox[0]);
      width = viewBox[3] - viewBox[1];
      height = viewBox[2] - viewBox[0];
    } else {
      offsetX = Math.abs(centerX - viewBox[0]);
      offsetY = Math.abs(centerY - viewBox[1]);
      width = viewBox[2] - viewBox[0];
      height = viewBox[3] - viewBox[1];
    }

    const m = [
      rA,
      rB,
      rC,
      rD,
      offsetX - rA * centerX - rC * centerY,
      offsetY - rB * centerX - rD * centerY,
    ];

    return { m, width, height, rot };
  };

  const screenToPdfPoint = (sx: number, sy: number, m: number[]): { x: number; y: number } => {
    const d = m[0] * m[3] - m[1] * m[2];
    const px = (sx * m[3] - sy * m[2] + m[2] * m[5] - m[4] * m[3]) / d;
    const py = (-sx * m[1] + sy * m[0] + m[4] * m[1] - m[5] * m[0]) / d;
    return { x: px, y: py };
  };

  const isSignatureFieldSigned = (fieldDict: any, widgetDict: any, doc: any): boolean => {
    try {
      if (!doc || !doc.context) return false;
      
      // 1. Traverse V entry on widget, field, or up to 5 levels of Parent hierarchy
      let vObj = fieldDict?.get?.(pdfLib.PDFName.of('V')) || widgetDict?.get?.(pdfLib.PDFName.of('V'));
      let curr = fieldDict || widgetDict;
      let depth = 0;
      while (!vObj && curr && depth < 5) {
        depth++;
        const parentRef = curr.get?.(pdfLib.PDFName.of('Parent'));
        if (!parentRef) break;
        curr = doc.context.lookup(parentRef);
        if (curr && curr instanceof pdfLib.PDFDict) {
          vObj = curr.get(pdfLib.PDFName.of('V'));
        }
      }

      if (vObj) {
        const resolved = doc.context.lookup(vObj);
        if (resolved && !(resolved instanceof pdfLib.PDFNull)) {
          if (resolved instanceof pdfLib.PDFDict) {
            const type = resolved.get(pdfLib.PDFName.of('Type'))?.toString();
            const hasByteRange = resolved.has(pdfLib.PDFName.of('ByteRange'));
            const hasContents = resolved.has(pdfLib.PDFName.of('Contents'));
            const hasFilter = resolved.has(pdfLib.PDFName.of('Filter'));
            const hasSubFilter = resolved.has(pdfLib.PDFName.of('SubFilter'));
            if (type === '/Sig' || hasByteRange || hasContents || hasFilter || hasSubFilter) {
              return true;
            }
            if (typeof (resolved as any).entries === 'function' && (resolved as any).entries().length > 0) {
              return true;
            }
          }
          return true;
        }
      }

      // 2. Check /AP (Appearance) stream:
      // Signed signature widgets always have an appearance stream (/AP) containing normal appearance (/N).
      // Unsigned signature fields never have an appearance stream.
      const apObj = widgetDict?.get?.(pdfLib.PDFName.of('AP')) || fieldDict?.get?.(pdfLib.PDFName.of('AP'));
      if (apObj) {
        const resolvedAp = doc.context.lookup(apObj);
        if (resolvedAp && resolvedAp instanceof pdfLib.PDFDict && resolvedAp.has(pdfLib.PDFName.of('N'))) {
          return true;
        }
      }

      return false;
    } catch (e) {
      console.warn("Error checking signature signed status:", e);
      return false;
    }
  };

  const checkFieldSigned = (field: any, doc: any, signedNames?: Set<string>, signedDicts?: Set<any>): boolean => {
    if (!field) return false;
    try {
      const name = typeof field.getName === 'function' ? field.getName() : '';
      if (name && signedNames?.has(name)) return true;

      if (typeof field.acroField?.V === 'function') {
        const v = field.acroField.V();
        if (v && !(v instanceof pdfLib.PDFNull)) return true;
      }
      if (typeof field.acroField?.getInheritableAttribute === 'function') {
        const v = field.acroField.getInheritableAttribute(pdfLib.PDFName.of('V'));
        if (v && !(v instanceof pdfLib.PDFNull)) return true;
      }

      const fieldDict = field.acroField?.dict;
      if (fieldDict && signedDicts?.has(fieldDict)) return true;
      if (isSignatureFieldSigned(fieldDict, null, doc)) return true;

      const widgets = field.acroField?.getWidgets?.() || [];
      for (const w of widgets) {
        if (w.dict && signedDicts?.has(w.dict)) return true;
        if (isSignatureFieldSigned(fieldDict, w.dict, doc)) return true;
      }
    } catch (e) {
      console.warn("Error in checkFieldSigned:", e);
    }
    return false;
  };

  const safeRemoveField = (doc: any, fieldName: string) => {
    try {
      const form = doc.getForm();
      let field: any;
      try {
        field = form.getField(fieldName);
      } catch {
        return;
      }
      if (!field) return;

      // Do not remove if field already has a cryptographic signature
      if (checkFieldSigned(field, doc)) {
        return;
      }

      const widgets = field.acroField?.getWidgets?.() || [];
      const acroFormFields = form.acroForm.dict.get(pdfLib.PDFName.of('Fields'));
      if (acroFormFields && typeof (acroFormFields as any).asArray === 'function') {
        const fieldsArr = (acroFormFields as any).asArray();
        const idx = fieldsArr.findIndex((fRef: any) => {
          const obj = doc.context.lookup(fRef);
          return obj === field.acroField.dict;
        });
        if (idx !== -1) {
          acroFormFields.remove(idx);
        }
      }

      for (const w of widgets) {
        for (const p of doc.getPages()) {
          const annots = p.node.Annots();
          if (annots) {
            for (let i = annots.size() - 1; i >= 0; i--) {
              const aRef = annots.get(i);
              const aObj = doc.context.lookup(aRef);
              if (aObj === w.dict || aRef === w.dict || (w.ref && (aRef === w.ref || aObj === w.ref))) {
                annots.remove(i);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not safely remove field:", fieldName, err);
    }
  };

  const extractFieldsFromPdf = async (buffer: Uint8Array, pagesData: PdfPage[]): Promise<Field[]> => {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pdfPages = pdfDoc.getPages();
      const extracted: Field[] = [];
      const processedWidgets = new Set<any>();

      // Build comprehensive registry of digitally signed objects across the PDF
      const signedSigRefTags = new Set<string>();
      for (const [ref, obj] of pdfDoc.context.indirectObjects.entries()) {
        if (obj instanceof pdfLib.PDFDict) {
          const type = obj.get(pdfLib.PDFName.of('Type'))?.toString();
          if (type === '/Sig' || obj.has(pdfLib.PDFName.of('ByteRange')) || obj.has(pdfLib.PDFName.of('Contents')) || obj.has(pdfLib.PDFName.of('Filter')) || obj.has(pdfLib.PDFName.of('SubFilter'))) {
            signedSigRefTags.add(ref.toString());
          }
        }
      }

      const signedFieldNames = new Set<string>();
      const signedWidgetDicts = new Set<any>();
      const signedWidgetRefTags = new Set<string>();

      for (const [ref, obj] of pdfDoc.context.indirectObjects.entries()) {
        if (obj instanceof pdfLib.PDFDict) {
          const v = obj.get(pdfLib.PDFName.of('V'));
          let isSigned = false;
          if (v) {
            if (v instanceof pdfLib.PDFRef && signedSigRefTags.has(v.toString())) {
              isSigned = true;
            } else {
              const resolved = pdfDoc.context.lookup(v);
              if (resolved instanceof pdfLib.PDFDict) {
                const t = resolved.get(pdfLib.PDFName.of('Type'))?.toString();
                if (t === '/Sig' || resolved.has(pdfLib.PDFName.of('ByteRange')) || resolved.has(pdfLib.PDFName.of('Contents')) || resolved.has(pdfLib.PDFName.of('Filter')) || resolved.has(pdfLib.PDFName.of('SubFilter'))) {
                  isSigned = true;
                }
              }
            }
          }

          // Any widget with FT /Sig that has an appearance stream (/AP) or Lock is already signed
          const ft = obj.get(pdfLib.PDFName.of('FT'))?.toString();
          const hasAP = obj.has(pdfLib.PDFName.of('AP'));
          if (ft === '/Sig' && hasAP) {
            isSigned = true;
          }

          if (isSigned) {
            signedWidgetDicts.add(obj);
            signedWidgetRefTags.add(ref.toString());
            const t = obj.get(pdfLib.PDFName.of('T'));
            if (t) {
              const nameStr = (t as any).value || (typeof (t as any).asString === 'function' ? (t as any).asString() : t.toString());
              if (nameStr) signedFieldNames.add(nameStr.replace(/^\(|\)$/g, ''));
            }
            const kids = obj.get(pdfLib.PDFName.of('Kids'));
            if (kids && typeof (kids as any).asArray === 'function') {
              (kids as any).asArray().forEach((k: any) => {
                if (k instanceof pdfLib.PDFRef) signedWidgetRefTags.add(k.toString());
                const kd = pdfDoc.context.lookup(k);
                if (kd) signedWidgetDicts.add(kd);
              });
            }
          }
        }
      }

      let formFields: any[] = [];
      try {
        const form = pdfDoc.getForm();
        formFields = form.getFields();
      } catch (e) {
        console.warn("No AcroForm in PDF:", e);
      }

      for (const field of formFields) {
        try {
          const isSig = (field instanceof pdfLib.PDFSignature) || 
                        field.constructor.name === 'PDFSignature' || 
                        field.acroField?.dict?.get(pdfLib.PDFName.of('FT'))?.toString() === '/Sig';
          
          const isText = (field instanceof pdfLib.PDFTextField) || 
                         field.constructor.name === 'PDFTextField' || 
                         field.acroField?.dict?.get(pdfLib.PDFName.of('FT'))?.toString() === '/Tx';

          if (!isSig && !isText) continue;

          const name = field.getName();

          // CHỈ HIỂN THỊ TRƯỜNG CHỮ KÝ CHƯA ĐƯỢC KÝ SỐ:
          // Bỏ qua nếu trường chữ ký này đã được ký số (có giá trị /V chứa chữ ký số hoặc nằm trong danh sách đã ký)
          const isSignedSig = isSig && (
            (name && signedFieldNames.has(name)) ||
            checkFieldSigned(field, pdfDoc, signedFieldNames, signedWidgetDicts)
          );

          if (isSignedSig) {
            const widgets = field.acroField?.getWidgets?.() || [];
            for (const w of widgets) {
              if (w.dict) processedWidgets.add(w.dict);
            }
            continue;
          }

          const widgets = field.acroField?.getWidgets?.() || [];

          for (const w of widgets) {
            if (w.dict) processedWidgets.add(w.dict);
            if (isSig && (
              isSignedSig ||
              (name && signedFieldNames.has(name)) ||
              (w.dict && signedWidgetDicts.has(w.dict)) ||
              (w.ref && signedWidgetRefTags.has(w.ref.toString())) ||
              isSignatureFieldSigned(field.acroField?.dict, w.dict, pdfDoc)
            )) {
              continue;
            }
            const rect = w.getRectangle();
            if (!rect || (rect.width <= 0 && rect.height <= 0)) continue;

            const pRef = typeof w.P === 'function' ? w.P() : (w.P || null);
            let pageIndex = -1;
            if (pRef) {
              pageIndex = pdfPages.findIndex(p => p.ref === pRef);
            }
            if (pageIndex === -1) {
              pageIndex = pdfPages.findIndex(p => {
                const annots = p.node.Annots();
                if (!annots) return false;
                for (let i = 0; i < annots.size(); i++) {
                  const aRef = annots.get(i);
                  const aObj = pdfDoc.context.lookup(aRef);
                  if (aObj === w.dict || aRef === w.dict || (w.ref && (aRef === w.ref || aObj === w.ref))) return true;
                }
                return false;
              });
            }
            if (pageIndex === -1) pageIndex = 0;

            const page = pdfPages[pageIndex];
            if (!page) continue;

            let angle = 0;
            try {
              const rot = page.getRotation();
              if (rot && typeof rot.angle === 'number') {
                angle = rot.angle;
              } else if (typeof rot === 'number') {
                angle = rot;
              }
            } catch (e) {
              console.error("Error getting page rotation", e);
            }
            angle = (angle % 360 + 360) % 360;

            const { boxX, boxY, visibleWidth, visibleHeight } = getPageEffectiveDimensions(page);

            const canvasPage = pagesData[pageIndex];
            const canvasWidth = canvasPage ? canvasPage.width : visibleWidth;
            const canvasHeight = canvasPage ? canvasPage.height : visibleHeight;

            let fX = 0;
            let fY = 0;
            let fWidth = 0;
            let fHeight = 0;

            if (angle === 90) {
              const scaleX = visibleHeight / canvasWidth;
              const scaleY = visibleWidth / canvasHeight;
              fWidth = rect.height / scaleX;
              fHeight = rect.width / scaleY;
              fY = (rect.x - boxX) / scaleY;
              fX = (rect.y - boxY) / scaleX;
            } else if (angle === 180) {
              const scaleX = visibleWidth / canvasWidth;
              const scaleY = visibleHeight / canvasHeight;
              fWidth = rect.width / scaleX;
              fHeight = rect.height / scaleY;
              fY = (rect.y - boxY) / scaleY;
              fX = (visibleWidth - (rect.x - boxX)) / scaleX - fWidth;
            } else if (angle === 270) {
              const scaleX = visibleHeight / canvasWidth;
              const scaleY = visibleWidth / canvasHeight;
              fWidth = rect.height / scaleX;
              fHeight = rect.width / scaleY;
              fY = (visibleWidth - (rect.x - boxX)) / scaleY - fHeight;
              fX = (visibleHeight - (rect.y - boxY)) / scaleX - fWidth;
            } else {
              const scaleX = visibleWidth / canvasWidth;
              const scaleY = visibleHeight / canvasHeight;
              fWidth = rect.width / scaleX;
              fHeight = rect.height / scaleY;
              fX = (rect.x - boxX) / scaleX;
              fY = (visibleHeight - (rect.y - boxY + rect.height)) / scaleY;
            }

            let textValue = '';
            if (isText && typeof (field as any).getText === 'function') {
              try {
                textValue = (field as any).getText() || '';
              } catch {}
            }

            extracted.push({
              id: Math.random().toString(36).substring(2, 9),
              pageIndex,
              x: Math.round(fX),
              y: Math.round(fY),
              width: Math.round(fWidth),
              height: Math.round(fHeight),
              type: isSig ? 'signature' : 'text',
              name,
              originalName: name,
              textValue,
              fontSize: 12
            });
          }
        } catch (fErr) {
          console.warn("Error parsing form field:", fErr);
        }
      }

      // Also scan page annotations in case there are widget annotations not picked up by form.getFields()
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const annots = page.node.Annots();
        if (!annots) continue;
        for (let aIdx = 0; aIdx < annots.size(); aIdx++) {
          try {
            const annotRef = annots.get(aIdx);
            const annotDict = pdfDoc.context.lookup(annotRef) as any;
            if (!annotDict || !(annotDict instanceof pdfLib.PDFDict)) continue;
            if (processedWidgets.has(annotDict)) continue;

            const subtype = annotDict.get(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Widget') continue;

            let parentDict: any = null;
            const parentRef = annotDict.get(pdfLib.PDFName.of('Parent'));
            if (parentRef) {
              parentDict = pdfDoc.context.lookup(parentRef);
            }

            const ft = annotDict.get(pdfLib.PDFName.of('FT'))?.toString() ||
                       parentDict?.get?.(pdfLib.PDFName.of('FT'))?.toString();
            const isSig = ft === '/Sig';
            const isText = ft === '/Tx';
            if (!isSig && !isText) continue;

            processedWidgets.add(annotDict);

            let name = '';
            const tEntry = annotDict.get(pdfLib.PDFName.of('T')) || parentDict?.get?.(pdfLib.PDFName.of('T'));
            if (tEntry) {
              if (typeof (tEntry as any).asString === 'function') {
                name = (tEntry as any).asString();
              } else if (typeof (tEntry as any).value === 'string') {
                name = (tEntry as any).value;
              }
            }
            if (!name) {
              name = isSig ? `Signature${extracted.length + 1}` : `TextField${extracted.length + 1}`;
            }

            // Bỏ qua nếu trường chữ ký này đã được ký số
            if (isSig) {
              const cleanName = name ? name.replace(/^\(|\)$/g, '') : '';
              const isSignedAnnot = (
                (cleanName && signedFieldNames.has(cleanName)) ||
                signedWidgetDicts.has(annotDict) ||
                (parentDict && signedWidgetDicts.has(parentDict)) ||
                (annotRef && signedWidgetRefTags.has(annotRef.toString())) ||
                isSignatureFieldSigned(parentDict, annotDict, pdfDoc)
              );
              if (isSignedAnnot) {
                continue;
              }
            }

            const rectArray = annotDict.get(pdfLib.PDFName.of('Rect'));
            if (!rectArray || typeof (rectArray as any).asArray !== 'function') continue;
            const rArr = (rectArray as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : (v.numberValue ?? 0));
            if (rArr.length < 4) continue;
            const rect = {
              x: Math.min(rArr[0], rArr[2]),
              y: Math.min(rArr[1], rArr[3]),
              width: Math.abs(rArr[2] - rArr[0]),
              height: Math.abs(rArr[3] - rArr[1]),
            };
            if (rect.width <= 0 && rect.height <= 0) continue;

            let angle = 0;
            try {
              const rot = page.getRotation();
              if (rot && typeof rot.angle === 'number') {
                angle = rot.angle;
              } else if (typeof rot === 'number') {
                angle = rot;
              }
            } catch (e) {}
            angle = (angle % 360 + 360) % 360;

            const { boxX, boxY, visibleWidth, visibleHeight } = getPageEffectiveDimensions(page);
            const canvasPage = pagesData[pIdx];
            const canvasWidth = canvasPage ? canvasPage.width : visibleWidth;
            const canvasHeight = canvasPage ? canvasPage.height : visibleHeight;

            let fX = 0, fY = 0, fWidth = 0, fHeight = 0;
            if (angle === 90) {
              const scaleX = visibleHeight / canvasWidth;
              const scaleY = visibleWidth / canvasHeight;
              fWidth = rect.height / scaleX;
              fHeight = rect.width / scaleY;
              fY = (rect.x - boxX) / scaleY;
              fX = (rect.y - boxY) / scaleX;
            } else if (angle === 180) {
              const scaleX = visibleWidth / canvasWidth;
              const scaleY = visibleHeight / canvasHeight;
              fWidth = rect.width / scaleX;
              fHeight = rect.height / scaleY;
              fY = (rect.y - boxY) / scaleY;
              fX = (visibleWidth - (rect.x - boxX)) / scaleX - fWidth;
            } else if (angle === 270) {
              const scaleX = visibleHeight / canvasWidth;
              const scaleY = visibleWidth / canvasHeight;
              fWidth = rect.height / scaleX;
              fHeight = rect.width / scaleY;
              fY = (visibleWidth - (rect.x - boxX)) / scaleY - fHeight;
              fX = (visibleHeight - (rect.y - boxY)) / scaleX - fWidth;
            } else {
              const scaleX = visibleWidth / canvasWidth;
              const scaleY = visibleHeight / canvasHeight;
              fWidth = rect.width / scaleX;
              fHeight = rect.height / scaleY;
              fX = (rect.x - boxX) / scaleX;
              fY = (visibleHeight - (rect.y - boxY + rect.height)) / scaleY;
            }

            extracted.push({
              id: Math.random().toString(36).substring(2, 9),
              pageIndex: pIdx,
              x: Math.round(fX),
              y: Math.round(fY),
              width: Math.round(fWidth),
              height: Math.round(fHeight),
              type: isSig ? 'signature' : 'text',
              name,
              originalName: name,
              textValue: '',
              fontSize: 12
            });
          } catch (e) {
            console.warn("Error parsing annot widget:", e);
          }
        }
      }

      return extracted;
    } catch (err) {
      console.warn("Could not extract fields from PDF:", err);
      return [];
    }
  };

  const renderPdfPages = async (buffer: ArrayBuffer | Uint8Array) => {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const parsedPages: PdfPage[] = [];
    const extractedTexts: PdfTextItem[] = [];
    const extractedHighlights: HighlightItem[] = [];

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const hiResViewport = page.getViewport({ scale: 2.5 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = hiResViewport.width;
      canvas.height = hiResViewport.height;

      // Extract existing annotations on the page:
      // 1. Hide Highlight annotations from being permanently baked into canvas pixels
      // 2. Load Highlights into interactive/editable overlays
      // 3. Keep digital signatures (SignatureWidgetAnnotation) and stamps visible on canvas!
      let pageAnnots: any[] = [];
      try {
        pageAnnots = await page.getAnnotations();
      } catch (annotErr) {
        // annotations not available
      }

      if (pageAnnots && Array.isArray(pageAnnots)) {
        pageAnnots.forEach((annot: any) => {
          if (annot.subtype === 'Square' || annot.subtype === 'Circle') {
            if (annot.id) {
              try {
                // Set noView: true in pdf.annotationStorage so pdfjs skips baking shapes into canvas bitmap
                (pdf as any).annotationStorage?.setValue(annot.id, { noView: true });
              } catch (e) {
                // ignore
              }
            }
          }
          if (annot.subtype === 'Highlight') {
            if (annot.id) {
              try {
                // Set noView: true in pdf.annotationStorage so pdfjs skips baking it into canvas bitmap
                (pdf as any).annotationStorage?.setValue(annot.id, { noView: true });
              } catch (e) {
                // ignore
              }
            }

            if (annot.rect) {
              const [r0, r1, r2, r3] = annot.rect;
              const [p1x, p1y] = viewport.convertToViewportPoint(r0, r3);
              const [p2x, p2y] = viewport.convertToViewportPoint(r2, r1);
              const hx = Math.min(p1x, p2x);
              const hy = Math.min(p1y, p2y);
              const hw = Math.abs(p2x - p1x);
              const hh = Math.abs(p2y - p1y);
              let hexColor = '#fde047';
              if (annot.color && Array.isArray(annot.color)) {
                const r = Math.round(annot.color[0] <= 1 ? annot.color[0] * 255 : annot.color[0]);
                const g = Math.round(annot.color[1] <= 1 ? annot.color[1] * 255 : annot.color[1]);
                const b = Math.round(annot.color[2] <= 1 ? annot.color[2] * 255 : annot.color[2]);
                hexColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
              }
              extractedHighlights.push({
                id: `annot-hl-${i - 1}-${annot.id || Math.random().toString(36).substring(2, 7)}`,
                pageIndex: i - 1,
                x: hx,
                y: hy,
                width: hw,
                height: hh,
                color: hexColor,
                opacity: 0.45,
              });
            }
          }
        });
      }

      await page.render({
        canvasContext: context,
        viewport: hiResViewport,
        annotationMode: 3, // 3 = AnnotationMode.ENABLE_STORAGE: preserves digital signatures/stamps while respecting noView for highlights
      } as any).promise;

      parsedPages.push({
        width: viewport.width,
        height: viewport.height,
        dataUrl: canvas.toDataURL('image/jpeg', 0.95),
        viewBox: viewport.viewBox && viewport.viewBox.length >= 4
          ? [viewport.viewBox[0], viewport.viewBox[1], viewport.viewBox[2], viewport.viewBox[3]]
          : undefined,
        pageRotation: viewport.rotation || 0,
      });

      try {
        const textContent = await page.getTextContent();
        const rawItems: any[] = [];

        textContent.items.forEach((item: any, streamIdx: number) => {
          if (!item.str || item.str.trim() === '') return;

          const transform = item.transform;
          const tx = transform[4];
          const ty = transform[5];
          const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
          const pdfRot = (Math.round((Math.atan2(transform[1], transform[0]) * 180) / Math.PI) % 360 + 360) % 360;
          // Độ cao phông chữ chuẩn xác theo trục dọc (vertical scale) của PDF
          const verticalScale = Math.sqrt(transform[2] * transform[2] + transform[3] * transform[3]);
          const horizontalScale = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
          const fontSize = verticalScale || item.height || horizontalScale;
          const fontProps = detectFontProperties(item, textContent, page, pdf);

          rawItems.push({
            str: item.str,
            tx,
            ty,
            vx,
            vy,
            pdfRot,
            width: item.width,
            fontSize,
            fontProps,
            streamIdx,
          });
        });

        // Sắp xếp các đoạn văn bản theo thứ tự đọc trên màn hình (vx, vy)
        rawItems.sort((a, b) => {
          const dy = a.vy - b.vy;
          if (Math.abs(dy) > Math.max(3, a.fontSize * 0.25 * viewport.scale)) {
            return dy;
          }
          if (Math.abs(a.vx - b.vx) > 1.5) {
            return a.vx - b.vx;
          }
          return a.streamIdx - b.streamIdx;
        });

        // Loại bỏ các lớp chữ trùng lặp (faux-bold vẽ đè 2 lần trong PDF hoặc chữ cũ nằm dưới lớp che trắng)
        const dedupedItems: any[] = [];
        for (const item of rawItems) {
          let isDuplicateOrCovered = false;
          for (let dIdx = dedupedItems.length - 1; dIdx >= 0; dIdx--) {
            const existing = dedupedItems[dIdx];
            if (Math.abs(existing.vy - item.vy) > Math.max(3, existing.fontSize * 0.28 * viewport.scale)) {
              break;
            }
            if (existing.pdfRot !== item.pdfRot) continue;

            // Trường hợp 1: Faux-bold hoặc chuỗi trùng hệt nhau tại cùng vị trí X
            if (
              Math.abs(existing.vx - item.vx) <= Math.max(4, existing.fontSize * 0.3 * viewport.scale) &&
              existing.str.trim() === item.str.trim()
            ) {
              if (Math.abs(existing.vx - item.vx) >= 0.05) {
                existing.fontProps.isBold = true;
              }
              isDuplicateOrCovered = true;
              break;
            }

            // Trường hợp 2: Hai đoạn văn bản đè trực tiếp lên nhau trên cùng 1 dòng (ví dụ: chữ mới đè lên chữ cũ dưới lớp whiteout)
            const exStart = existing.vx;
            const exEnd = existing.vx + existing.width * viewport.scale;
            const itStart = item.vx;
            const itEnd = item.vx + item.width * viewport.scale;
            const overlapStart = Math.max(exStart, itStart);
            const overlapEnd = Math.min(exEnd, itEnd);
            const overlapW = overlapEnd - overlapStart;
            const minW = Math.min(existing.width * viewport.scale, item.width * viewport.scale);

            if (minW > 4 && overlapW > Math.max(6, minW * 0.35)) {
              // Giữ lại lớp chữ có streamIdx lớn hơn (vẽ sau = nằm trên cùng)
              if (item.streamIdx > existing.streamIdx) {
                dedupedItems[dIdx] = { ...item };
              }
              isDuplicateOrCovered = true;
              break;
            }
          }
          if (!isDuplicateOrCovered) {
            dedupedItems.push({ ...item });
          }
        }

        // Gộp các cụm từ liên tiếp trên cùng một dòng khi cùng phông, cùng độ đậm, cùng độ nghiêng và cùng góc xoay
        const mergedItems: any[] = [];
        for (const item of dedupedItems) {
          const prev = mergedItems.length > 0 ? mergedItems[mergedItems.length - 1] : null;
          const prevEndVx = prev ? prev.vx + prev.width * viewport.scale : 0;
          const gapScreen = prev ? item.vx - prevEndVx : 0;
          if (
            prev &&
            prev.pdfRot === item.pdfRot &&
            Math.abs(prev.vy - item.vy) <= Math.max(2, prev.fontSize * 0.2 * viewport.scale) &&
            gapScreen >= -Math.max(2.5, prev.fontSize * 0.2 * viewport.scale) &&
            gapScreen <= Math.max(prev.fontSize * 0.85 * viewport.scale, 15) &&
            prev.fontProps.fontFamily === item.fontProps.fontFamily &&
            prev.fontProps.isBold === item.fontProps.isBold &&
            prev.fontProps.isItalic === item.fontProps.isItalic &&
            Math.abs(prev.fontSize - item.fontSize) <= 0.8
          ) {
            const gap = gapScreen / viewport.scale;
            const needsSpace = gap > (prev.fontSize * 0.14) && !prev.str.endsWith(' ') && !item.str.startsWith(' ');
            prev.str += (needsSpace ? ' ' : '') + item.str;
            prev.width = Math.max(prev.width, (item.vx - prev.vx) / viewport.scale + item.width);
          } else {
            mergedItems.push({ ...item });
          }
        }

        mergedItems.forEach((item, idx) => {
          const [vx, vy] = viewport.convertToViewportPoint(item.tx, item.ty);
          const scale = viewport.scale;

          // Hiệu chuẩn kích thước phông chữ thực tế (calibratedFontSize) khớp 1:1 với độ rộng chữ gốc trên PDF
          let calibratedSize = item.fontSize;
          if (measureCtx && item.str && item.str.trim().length >= 3 && item.width > 0) {
            try {
              const cssFontStack = getFontFamily(item.fontProps.fontFamily);
              measureCtx.font = `${item.fontProps.isItalic ? 'italic ' : ''}${item.fontProps.isBold ? '700 ' : '400 '}100px ${cssFontStack}`;
              const unitWidth = measureCtx.measureText(item.str).width / 100;
              if (unitWidth > 0) {
                const widthMatchedSize = item.width / unitWidth;
                // Giới hạn trong khoảng hợp lý [84% .. 104%] để cỡ chữ khớp chính xác với dòng chữ gốc
                if (widthMatchedSize >= item.fontSize * 0.80 && widthMatchedSize <= item.fontSize * 1.12) {
                  calibratedSize = Math.max(item.fontSize * 0.84, Math.min(item.fontSize * 1.03, widthMatchedSize));
                }
              }
            } catch (e) {
              // ignore
            }
          }

          const itemWidth = item.width * scale;
          const itemHeight = calibratedSize * scale;
          // Căn chỉnh vị trí Y theo đúng baseline thực tế của phông chữ (ascent ~ 82% em-height)
          const finalY = vy - itemHeight * 0.82;
          const roundedSize = Math.round(calibratedSize * 20) / 20;

          extractedTexts.push({
            id: `text-${i - 1}-${idx}`,
            text: item.str,
            originalText: item.str,
            x: vx,
            y: finalY,
            width: itemWidth || 50,
            originalWidth: itemWidth || 50,
            height: itemHeight || calibratedSize,
            fontSize: calibratedSize,
            fontName: item.fontProps.rawName,
            pageIndex: i - 1,
            isModified: false,
            pdfX: item.tx,
            pdfY: item.ty,
            pdfWidth: item.width,
            pdfHeight: item.fontSize,
            customFontFamily: item.fontProps.fontFamily,
            customFontSize: roundedSize,
            isBold: item.fontProps.isBold,
            isItalic: item.fontProps.isItalic,
            offsetX: 0,
            offsetY: 0,
            hasBackground: true,
            customColor: '#000000',
            rotation: item.pdfRot || 0,
            baselineY: vy,
          });
        });

      } catch (err) {
        console.error(`Error extracting text content at page ${i}:`, err);
      }
    }
    setPages(parsedPages);
    setPdfTexts(extractedTexts);
    if (extractedHighlights.length > 0) {
      setHighlights(prev => {
        const merged = [...prev];
        for (const eh of extractedHighlights) {
          if (!merged.some(h => h.pageIndex === eh.pageIndex && Math.abs(h.x - eh.x) < 5 && Math.abs(h.y - eh.y) < 5)) {
            merged.push(eh);
          }
        }
        return merged;
      });
    }
    setSelectedPageIndices([]);
    return parsedPages;
  };

  const extractHighlightsFromPdf = (pdfDoc: PDFDocument, parsedPages: PdfPage[]): HighlightItem[] => {
    const result: HighlightItem[] = [];
    try {
      const docPages = pdfDoc.getPages();
      for (let pIdx = 0; pIdx < docPages.length; pIdx++) {
        const page = docPages[pIdx];
        const parsedPage = parsedPages[pIdx];
        if (!parsedPage) continue;
        const { width, height } = page.getSize();
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {
          // ignore
        }
        const scaleX = visibleWidth / parsedPage.width;
        const scaleY = visibleHeight / parsedPage.height;

        const annots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (annots && typeof (annots as any).size === 'function') {
          const annotCount = (annots as any).size();
          for (let aIdx = 0; aIdx < annotCount; aIdx++) {
            const annot = (annots as any).lookup(aIdx);
            if (!annot) continue;
            const subtype = annot.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype === '/Highlight') {
              const rectObj = annot.lookup(pdfLib.PDFName.of('Rect'));
              if (rectObj && typeof (rectObj as any).asArray === 'function') {
                const coords = (rectObj as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : Number(v));
                if (coords.length >= 4) {
                  const rectX = Math.min(coords[0], coords[2]);
                  const rectY = Math.min(coords[1], coords[3]);
                  const rectW = Math.abs(coords[2] - coords[0]);
                  const rectH = Math.abs(coords[3] - coords[1]);

                  const x = (rectX - boxX) / scaleX;
                  const widthVal = rectW / scaleX;
                  const y = (visibleHeight - (rectY + rectH - boxY)) / scaleY;
                  const heightVal = rectH / scaleY;

                  let colorHex = '#fde047';
                  const colorObj = annot.lookup(pdfLib.PDFName.of('C'));
                  if (colorObj && typeof (colorObj as any).asArray === 'function') {
                    const rgbVals = (colorObj as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : Number(v));
                    if (rgbVals.length >= 3) {
                      const r = Math.round(rgbVals[0] * 255).toString(16).padStart(2, '0');
                      const g = Math.round(rgbVals[1] * 255).toString(16).padStart(2, '0');
                      const b = Math.round(rgbVals[2] * 255).toString(16).padStart(2, '0');
                      colorHex = `#${r}${g}${b}`;
                    }
                  }

                  let opacity = 0.45;
                  const caObj = annot.lookup(pdfLib.PDFName.of('CA'));
                  if (caObj && typeof (caObj as any).asNumber === 'function') {
                    opacity = (caObj as any).asNumber();
                  }

                  result.push({
                    id: `hl-pdf-${pIdx}-${aIdx}-${Math.random().toString(36).substring(2, 7)}`,
                    pageIndex: pIdx,
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.round(widthVal),
                    height: Math.round(heightVal),
                    color: colorHex,
                    opacity,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not extract native highlight annotations:", err);
    }
    return result;
  };

  const extractTextBoxesFromPdf = (pdfDoc: PDFDocument, parsedPages: PdfPage[]): TextBoxItem[] => {
    const result: TextBoxItem[] = [];
    try {
      const docPages = pdfDoc.getPages();
      for (let pIdx = 0; pIdx < docPages.length; pIdx++) {
        const page = docPages[pIdx];
        const parsedPage = parsedPages[pIdx];
        if (!parsedPage) continue;
        const { width, height } = page.getSize();
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {
          // ignore
        }

        let angle = 0;
        try {
          const rot = page.getRotation();
          if (rot && typeof rot.angle === 'number') {
            angle = rot.angle;
          } else if (typeof rot === 'number') {
            angle = rot;
          }
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const annots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (annots && typeof (annots as any).size === 'function') {
          const annotCount = (annots as any).size();
          for (let aIdx = 0; aIdx < annotCount; aIdx++) {
            const annot = (annots as any).lookup(aIdx);
            if (!annot) continue;
            const subtype = annot.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype === '/FreeText') {
              // 1. Check if CustomMeta has full state
              const customMeta = annot.lookup(pdfLib.PDFName.of('CustomMeta'));
              if (customMeta && typeof (customMeta as any).decodeText === 'function') {
                try {
                  const metaParsed = JSON.parse((customMeta as any).decodeText());
                  if (metaParsed && metaParsed.text !== undefined) {
                    result.push({
                      ...metaParsed,
                      pageIndex: pIdx,
                      id: metaParsed.id || `tb-pdf-${pIdx}-${aIdx}-${Math.random().toString(36).substring(2, 7)}`,
                    });
                    continue;
                  }
                } catch (e) {
                  // fallback to manual extraction
                }
              }

              // 2. Fallback: manual extraction from PDF standard FreeText annotation
              const rectObj = annot.lookup(pdfLib.PDFName.of('Rect'));
              if (rectObj && typeof (rectObj as any).asArray === 'function') {
                const coords = (rectObj as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : Number(v));
                if (coords.length >= 4) {
                  const rectX = Math.min(coords[0], coords[2]);
                  const rectY = Math.min(coords[1], coords[3]);
                  const rectW = Math.abs(coords[2] - coords[0]);
                  const rectH = Math.abs(coords[3] - coords[1]);

                  const canvasWidth = parsedPage.width;
                  const canvasHeight = parsedPage.height;

                  let x = 0;
                  let y = 0;
                  let widthVal = 0;
                  let heightVal = 0;

                  if (angle === 90) {
                    const scaleX = visibleHeight / canvasWidth;
                    const scaleY = visibleWidth / canvasHeight;
                    widthVal = rectH / scaleX;
                    heightVal = rectW / scaleY;
                    y = (rectX - boxX) / scaleY;
                    x = (rectY - boxY) / scaleX;
                  } else if (angle === 180) {
                    const scaleX = visibleWidth / canvasWidth;
                    const scaleY = visibleHeight / canvasHeight;
                    widthVal = rectW / scaleX;
                    heightVal = rectH / scaleY;
                    y = (rectY - boxY) / scaleY;
                    x = (visibleWidth - (rectX - boxX)) / scaleX - widthVal;
                  } else if (angle === 270) {
                    const scaleX = visibleHeight / canvasWidth;
                    const scaleY = visibleWidth / canvasHeight;
                    widthVal = rectH / scaleX;
                    heightVal = rectW / scaleY;
                    y = (visibleWidth - (rectX - boxX)) / scaleY - heightVal;
                    x = (visibleHeight - (rectY - boxY)) / scaleX - widthVal;
                  } else {
                    const scaleX = visibleWidth / canvasWidth;
                    const scaleY = visibleHeight / canvasHeight;
                    widthVal = rectW / scaleX;
                    heightVal = rectH / scaleY;
                    x = (rectX - boxX) / scaleX;
                    y = (visibleHeight - (rectY - boxY + rectH)) / scaleY;
                  }

                  let textContent = '';
                  const contentsObj = annot.lookup(pdfLib.PDFName.of('Contents'));
                  if (contentsObj) {
                    if (typeof (contentsObj as any).decodeText === 'function') {
                      textContent = (contentsObj as any).decodeText();
                    } else if (typeof (contentsObj as any).asString === 'function') {
                      textContent = (contentsObj as any).asString();
                    }
                  }

                  let colorHex = '#000000';
                  let fontSize = 14;
                  let fontFamily = 'Times New Roman';
                  const daObj = annot.lookup(pdfLib.PDFName.of('DA'));
                  if (daObj) {
                    const daStr = typeof (daObj as any).asString === 'function' ? (daObj as any).asString() : daObj.toString();
                    if (daStr.toLowerCase().includes('times')) fontFamily = 'Times New Roman';
                    else if (daStr.toLowerCase().includes('arial') || daStr.toLowerCase().includes('helv')) fontFamily = 'Arial';
                    
                    const sizeMatch = daStr.match(/(\d+(?:\.\d+)?)\s+Tf/);
                    if (sizeMatch && sizeMatch[1]) {
                      fontSize = Math.round(parseFloat(sizeMatch[1]));
                    }
                  }

                  result.push({
                    id: `tb-pdf-${pIdx}-${aIdx}-${Math.random().toString(36).substring(2, 7)}`,
                    pageIndex: pIdx,
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.max(80, Math.round(widthVal)),
                    height: Math.max(30, Math.round(heightVal)),
                    text: textContent || '',
                    fontFamily,
                    fontSize,
                    isBold: false,
                    isItalic: false,
                    color: colorHex,
                    textAlign: 'left',
                    hasBackground: false,
                    hasBorder: false,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not extract native text box annotations:", err);
    }
    return result;
  };

  const extractShapesFromPdf = (pdfDoc: PDFDocument, parsedPages: PdfPage[]): ShapeItem[] => {
    const result: ShapeItem[] = [];
    try {
      const docPages = pdfDoc.getPages();
      for (let pIdx = 0; pIdx < docPages.length; pIdx++) {
        const page = docPages[pIdx];
        const parsedPage = parsedPages[pIdx];
        if (!parsedPage) continue;
        const { width, height } = page.getSize();
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {}

        let angle = 0;
        try {
          const rot = page.getRotation();
          if (rot && typeof rot.angle === 'number') {
            angle = rot.angle;
          } else if (typeof rot === 'number') {
            angle = rot;
          }
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const annots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (annots && typeof (annots as any).size === 'function') {
          const annotCount = (annots as any).size();
          for (let aIdx = 0; aIdx < annotCount; aIdx++) {
            const annot = (annots as any).lookup(aIdx);
            if (!annot) continue;
            const subtype = annot.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype === '/Square' || subtype === '/Circle') {
              // 1. Check CustomMeta first for exact ShapeItem state
              const customMeta = annot.lookup(pdfLib.PDFName.of('CustomMeta'));
              if (customMeta) {
                try {
                  const rawStr = typeof (customMeta as any).decodeText === 'function'
                    ? (customMeta as any).decodeText()
                    : typeof (customMeta as any).asString === 'function'
                    ? (customMeta as any).asString()
                    : '';
                  if (rawStr) {
                    const decoded = rawStr.startsWith('%') || rawStr.includes('%7B') ? decodeURIComponent(rawStr) : rawStr;
                    const metaParsed = JSON.parse(decoded);
                    if (metaParsed && typeof metaParsed.x === 'number') {
                      result.push({
                        ...metaParsed,
                        pageIndex: pIdx,
                        id: metaParsed.id || `shape-pdf-${pIdx}-${aIdx}-${Math.random().toString(36).substring(2, 7)}`,
                      });
                      continue;
                    }
                  }
                } catch (e) {}
              }

              // 2. Fallback: extract from standard PDF /Square or /Circle annotation properties
              const rectObj = annot.lookup(pdfLib.PDFName.of('Rect'));
              if (rectObj && typeof (rectObj as any).asArray === 'function') {
                const coords = (rectObj as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : Number(v));
                if (coords.length >= 4) {
                  const rectX = Math.min(coords[0], coords[2]);
                  const rectY = Math.min(coords[1], coords[3]);
                  const rectW = Math.abs(coords[2] - coords[0]);
                  const rectH = Math.abs(coords[3] - coords[1]);

                  const canvasWidth = parsedPage.width;
                  const canvasHeight = parsedPage.height;
                  let x = 0, y = 0, widthVal = 0, heightVal = 0;

                  if (angle === 90) {
                    const scaleX = visibleHeight / canvasWidth;
                    const scaleY = visibleWidth / canvasHeight;
                    widthVal = rectH / scaleX;
                    heightVal = rectW / scaleY;
                    y = (rectX - boxX) / scaleY;
                    x = (rectY - boxY) / scaleX;
                  } else if (angle === 180) {
                    const scaleX = visibleWidth / canvasWidth;
                    const scaleY = visibleHeight / canvasHeight;
                    widthVal = rectW / scaleX;
                    heightVal = rectH / scaleY;
                    y = (rectY - boxY) / scaleY;
                    x = (visibleWidth - (rectX - boxX)) / scaleX - widthVal;
                  } else if (angle === 270) {
                    const scaleX = visibleHeight / canvasWidth;
                    const scaleY = visibleWidth / canvasHeight;
                    widthVal = rectH / scaleX;
                    heightVal = rectW / scaleY;
                    y = (visibleWidth - (rectX - boxX)) / scaleY - heightVal;
                    x = (visibleHeight - (rectY - boxY)) / scaleX - widthVal;
                  } else {
                    const scaleX = visibleWidth / canvasWidth;
                    const scaleY = visibleHeight / canvasHeight;
                    widthVal = rectW / scaleX;
                    heightVal = rectH / scaleY;
                    x = (rectX - boxX) / scaleX;
                    y = (visibleHeight - (rectY - boxY + rectH)) / scaleY;
                  }

                  let strokeColorHex = '#ef4444';
                  const colorObj = annot.lookup(pdfLib.PDFName.of('C'));
                  if (colorObj && typeof (colorObj as any).asArray === 'function') {
                    const rgbVals = (colorObj as any).asArray().map((v: any) => typeof v.asNumber === 'function' ? v.asNumber() : Number(v));
                    if (rgbVals.length >= 3) {
                      const r = Math.round(rgbVals[0] * 255).toString(16).padStart(2, '0');
                      const g = Math.round(rgbVals[1] * 255).toString(16).padStart(2, '0');
                      const b = Math.round(rgbVals[2] * 255).toString(16).padStart(2, '0');
                      strokeColorHex = `#${r}${g}${b}`;
                    }
                  }

                  result.push({
                    id: `shape-pdf-${pIdx}-${aIdx}-${Math.random().toString(36).substring(2, 7)}`,
                    pageIndex: pIdx,
                    type: subtype === '/Circle' ? 'circle' : 'rectangle',
                    x: Math.round(x),
                    y: Math.round(y),
                    width: Math.max(12, Math.round(widthVal)),
                    height: Math.max(12, Math.round(heightVal)),
                    strokeColor: strokeColorHex,
                    strokeWidth: 2,
                    strokeStyle: 'solid',
                    fillColor: 'transparent',
                    opacity: 1,
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not extract native shape annotations:", err);
    }
    return result;
  };

  const loadPdfFromFile = async (file: File, handle?: any) => {
    if (!file) return;

    fileHandleRef.current = handle || null;
    setHasDirectFileHandle(Boolean(handle));
    setIsProcessing(true);
    setDocumentName(file.name);
    setHighlights([]);
    setSelectedHighlightId(null);
    setShapes([]);
    setSelectedShapeId(null);
    setImages([]);
    setSelectedImageId(null);
    setTextBoxes([]);
    setSelectedTextBoxId(null);
    setEditingTextBoxId(null);
    setUndoStack([]);
    setRedoStack([]);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      setOriginalPdfBuffer(uint8Array);
      
      const isSigned = checkIsDigitallySigned(uint8Array);
      setIsDigitallySigned(isSigned);
      if (isSigned) {
        setShowSignedWarningModal(true);
        setActiveTool('Select');
      }
      
      const parsedPages = await renderPdfPages(uint8Array);

      // Restore saved highlights & shapes from embedded PDF metadata, native PDF Annotations, or localStorage
      let loadedHighlights: HighlightItem[] = [];
      let loadedShapes: ShapeItem[] = [];
      let hasEmbeddedShapesMeta = false;
      try {
        const loadedPdfDoc = await PDFDocument.load(uint8Array, { ignoreEncryption: true });
        const subject = loadedPdfDoc.getSubject();
        if (subject) {
          try {
            const parsedMeta = JSON.parse(subject);
            if (Array.isArray(parsedMeta.highlights) && parsedMeta.highlights.length > 0) {
              loadedHighlights = parsedMeta.highlights;
            }
            if (Array.isArray(parsedMeta.shapes)) {
              loadedShapes = parsedMeta.shapes;
              hasEmbeddedShapesMeta = true;
            }
          } catch (e) {
            // ignore
          }
        }

        // Also extract any native /Highlight annotations from the PDF
        const nativeHighlights = extractHighlightsFromPdf(loadedPdfDoc, parsedPages);
        if (nativeHighlights.length > 0) {
          if (loadedHighlights.length === 0) {
            loadedHighlights = nativeHighlights;
          } else {
            for (const nh of nativeHighlights) {
              const alreadyExists = loadedHighlights.some(lh => 
                lh.pageIndex === nh.pageIndex &&
                Math.abs(lh.x - nh.x) < 8 &&
                Math.abs(lh.y - nh.y) < 8
              );
              if (!alreadyExists) {
                loadedHighlights.push(nh);
              }
            }
          }
        }

        // Also extract any native /Square and /Circle annotations from the PDF
        const nativeShapes = extractShapesFromPdf(loadedPdfDoc, parsedPages);
        if (nativeShapes.length > 0) {
          if (loadedShapes.length === 0) {
            loadedShapes = nativeShapes;
          } else {
            for (const ns of nativeShapes) {
              const alreadyExists = loadedShapes.some(ls =>
                ls.pageIndex === ns.pageIndex &&
                Math.abs(ls.x - ns.x) < 8 &&
                Math.abs(ls.y - ns.y) < 8
              );
              if (!alreadyExists) {
                loadedShapes.push(ns);
              }
            }
          }
        }
      } catch (e) {
        // ignore
      }

      if (loadedHighlights.length === 0) {
        try {
          const cached = localStorage.getItem(`pdf_highlights_${file.name}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              loadedHighlights = parsed;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      if (loadedHighlights.length > 0) {
        setHighlights(loadedHighlights);
      }

      // Check localStorage for shapes fallback if PDF didn't already embed shape metadata
      if (loadedShapes.length === 0 && !hasEmbeddedShapesMeta) {
        try {
          const cachedShapes = localStorage.getItem(`pdf_shapes_${file.name}`);
          if (cachedShapes) {
            const parsedSh = JSON.parse(cachedShapes);
            if (Array.isArray(parsedSh) && parsedSh.length > 0) {
              loadedShapes = parsedSh;
            }
          }
        } catch (e) {}
      }

      setShapes(loadedShapes);

      // Do not re-inject text boxes when opening a file because text is already written directly into the PDF
      setTextBoxes([]);
      initialLoadedTextBoxesRef.current = [];
      setDeletedTextBoxes([]);

      try {
        const loadedFields = await extractFieldsFromPdf(uint8Array, parsedPages);
        setFields(loadedFields);
        setInitialFieldNames(loadedFields.map(f => f.name));
      } catch (fErr) {
        console.warn("Could not extract existing fields from PDF:", fErr);
        setFields([]);
        setInitialFieldNames([]);
      }
    } catch (err) {
      console.error("Error parsing PDF", err);
      alert("Không thể đọc file PDF này.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadPdfFromFile(file, null);
  };

  const handleOpenPdfClick = async () => {
    if (typeof (window as any).showOpenFilePicker === 'function') {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Tài liệu PDF (*.pdf)',
              accept: { 'application/pdf': ['.pdf'] },
            },
          ],
          multiple: false,
        });
        if (handle) {
          const file = await handle.getFile();
          await loadPdfFromFile(file, handle);
        }
        return;
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          return;
        }
        // Fallback to hidden file input if blocked by iframe policy
      }
    }
    fileInputRef.current?.click();
  };

  const handleAppendPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isDigitallySigned) {
       alert("Tài liệu hiện tại đã được ký số. Việc thêm trang đã bị khóa để tránh làm hỏng chữ ký số.");
       if (appendFileInputRef.current) appendFileInputRef.current.value = '';
       return;
    }

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const newPdfBytes = new Uint8Array(arrayBuffer);
      
      if (!originalPdfBuffer) {
        setOriginalPdfBuffer(newPdfBytes);
        setDocumentName(file.name);
        await renderPdfPages(newPdfBytes);
      } else {
        const existingDoc = await PDFDocument.load(originalPdfBuffer);
        const newDoc = await PDFDocument.load(newPdfBytes);
        
        const copiedPages = await existingDoc.copyPages(newDoc, newDoc.getPageIndices());
        copiedPages.forEach((page) => existingDoc.addPage(page));
        
        const mergedBytes = await existingDoc.save();
        setOriginalPdfBuffer(mergedBytes);
        await renderPdfPages(mergedBytes);
      }
    } catch (error) {
       console.error('Error merging PDF:', error);
       alert("Không thể thêm trang từ file PDF đã chọn.");
    } finally {
       setIsProcessing(false);
       if (appendFileInputRef.current) appendFileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    let mounted = true;
    loadSessionFromIndexedDB().then(async (session) => {
      if (!mounted || !session || !session.pdfBytes) return;
      try {
        setIsProcessing(true);
        const uint8 = session.pdfBytes instanceof Uint8Array
          ? session.pdfBytes
          : new Uint8Array(session.pdfBytes);
        setDocumentName(session.documentName || 'Tai-lieu.pdf');
        setOriginalPdfBuffer(uint8);
        const isSigned = checkIsDigitallySigned(uint8);
        setIsDigitallySigned(isSigned);
        await renderPdfPages(uint8);
        if (Array.isArray(session.highlights)) setHighlights(session.highlights);
        if (Array.isArray(session.shapes)) setShapes(session.shapes);
        if (Array.isArray(session.fields)) setFields(session.fields);
        if (Array.isArray(session.pdfTexts) && session.pdfTexts.length > 0) {
          setPdfTexts((prev) =>
            prev.map((item) => {
              const mod = session.pdfTexts.find((m: any) => m.id === item.id);
              return mod ? { ...item, ...mod, isModified: true } : item;
            })
          );
        }
        if (session.activeTool) setActiveTool(session.activeTool);
      } catch (e) {
        console.error('Failed to restore session from IndexedDB:', e);
      } finally {
        setIsProcessing(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleWorkspaceFileDrop = async (e: React.DragEvent) => {
    const hasFiles = Array.from(e.dataTransfer.types || []).includes('Files');
    if (!hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setIsWorkspaceDragOver(false);

    let firstHandlePromise: Promise<any> | null = null;
    try {
      const firstItem = e.dataTransfer.items?.[0] as any;
      if (firstItem && typeof firstItem.getAsFileSystemHandle === 'function') {
        firstHandlePromise = firstItem.getAsFileSystemHandle();
      }
    } catch {}

    const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const pdfFile = droppedFiles.find(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfFile) return;

    let resolvedHandle: any = null;
    if (firstHandlePromise) {
      try {
        const h = await firstHandlePromise;
        if (h && h.kind === 'file') {
          resolvedHandle = h;
        }
      } catch {}
    }

    await loadPdfFromFile(pdfFile, resolvedHandle);
  };

  const handleDropPdfFiles = async (
    files: File[],
    targetIndex?: number,
    firstFileHandlePromise?: Promise<any> | null
  ) => {
    const pdfFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfFiles.length === 0) return;

    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Việc thêm trang đã bị khóa để tránh làm hỏng chữ ký số.");
      return;
    }

    if (!originalPdfBuffer && pdfFiles.length === 1) {
      let resolvedHandle: any = null;
      if (firstFileHandlePromise) {
        try {
          const h = await firstFileHandlePromise;
          if (h && h.kind === 'file') {
            resolvedHandle = h;
          }
        } catch {}
      }
      await loadPdfFromFile(pdfFiles[0], resolvedHandle);
      return;
    }

    setIsProcessing(true);
    try {
      if (!originalPdfBuffer) {
        const firstBuf = new Uint8Array(await pdfFiles[0].arrayBuffer());
        const baseDoc = await PDFDocument.load(firstBuf);
        for (let i = 1; i < pdfFiles.length; i++) {
          const nextBuf = new Uint8Array(await pdfFiles[i].arrayBuffer());
          const nextDoc = await PDFDocument.load(nextBuf);
          const copied = await baseDoc.copyPages(nextDoc, nextDoc.getPageIndices());
          copied.forEach((p) => baseDoc.addPage(p));
        }
        const savedBytes = await baseDoc.save();
        setDocumentName(pdfFiles[0].name);
        setOriginalPdfBuffer(savedBytes);
        await renderPdfPages(savedBytes);
      } else {
        const existingDoc = await PDFDocument.load(originalPdfBuffer);
        const totalCurrent = existingDoc.getPageCount();
        const insertPos =
          targetIndex !== undefined
            ? Math.min(Math.max(0, targetIndex), totalCurrent)
            : totalCurrent;

        let totalInserted = 0;
        for (const file of pdfFiles) {
          const buf = new Uint8Array(await file.arrayBuffer());
          const newDoc = await PDFDocument.load(buf);
          const copiedPages = await existingDoc.copyPages(newDoc, newDoc.getPageIndices());
          copiedPages.forEach((page, idx) => {
            existingDoc.insertPage(insertPos + totalInserted + idx, page);
          });
          totalInserted += copiedPages.length;
        }

        const mergedBytes = await existingDoc.save();
        setOriginalPdfBuffer(mergedBytes);

        if (insertPos < totalCurrent && totalInserted > 0) {
          setFields((prev) =>
            prev.map((f) =>
              f.pageIndex >= insertPos ? { ...f, pageIndex: f.pageIndex + totalInserted } : f
            )
          );
          setPdfTexts((prev) =>
            prev.map((t) =>
              t.pageIndex >= insertPos ? { ...t, pageIndex: t.pageIndex + totalInserted } : t
            )
          );
          setHighlights((prev) =>
            prev.map((h) =>
              h.pageIndex >= insertPos ? { ...h, pageIndex: h.pageIndex + totalInserted } : h
            )
          );
          setShapes((prev) =>
            prev.map((s) =>
              s.pageIndex >= insertPos ? { ...s, pageIndex: s.pageIndex + totalInserted } : s
            )
          );
          setTextBoxes((prev) =>
            prev.map((tb) =>
              tb.pageIndex >= insertPos ? { ...tb, pageIndex: tb.pageIndex + totalInserted } : tb
            )
          );
        }

        await renderPdfPages(mergedBytes);
      }
    } catch (error) {
      console.error('Error dropping PDF files:', error);
      alert("Không thể thêm trang từ file PDF đã kéo vào.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePageConfirm = async () => {
    if (!deletePageConfirm || !originalPdfBuffer) return;

    if (isDigitallySigned) {
       alert("Tài liệu hiện tại đã được ký số. Việc xóa trang đã bị khóa để tránh làm hỏng chữ ký số.");
       setDeletePageConfirm(null);
       return;
    }

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      pdfDoc.removePage(deletePageConfirm.index);
      const newPdfBytes = await pdfDoc.save();
      setOriginalPdfBuffer(newPdfBytes);
      
      // Update fields page index
      setFields(fields.filter(f => f.pageIndex !== deletePageConfirm.index).map(f => {
         if (f.pageIndex > deletePageConfirm.index) {
            return { ...f, pageIndex: f.pageIndex - 1 };
         }
         return f;
      }));

      // Update pdfTexts page index
      setPdfTexts(pdfTexts.filter(t => t.pageIndex !== deletePageConfirm.index).map(t => {
         if (t.pageIndex > deletePageConfirm.index) {
            return { ...t, pageIndex: t.pageIndex - 1 };
         }
         return t;
      }));

      // Update highlights page index
      setHighlights(highlights.filter(h => h.pageIndex !== deletePageConfirm.index).map(h => {
         if (h.pageIndex > deletePageConfirm.index) {
            return { ...h, pageIndex: h.pageIndex - 1 };
         }
         return h;
      }));

      // Update shapes page index
      setShapes(shapes.filter(s => s.pageIndex !== deletePageConfirm.index).map(s => {
         if (s.pageIndex > deletePageConfirm.index) {
            return { ...s, pageIndex: s.pageIndex - 1 };
         }
         return s;
      }));
      
      await renderPdfPages(newPdfBytes);
      setDeletePageConfirm(null);
    } catch (e) {
      console.error(e);
      alert("Không thể xóa trang này.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInsertPageBefore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || insertTargetIndex === null || !originalPdfBuffer) return;

    if (isDigitallySigned) {
       alert("Tài liệu hiện tại đã được ký số. Việc chèn trang đã bị khóa để tránh làm hỏng chữ ký số.");
       setInsertTargetIndex(null);
       if (insertFileInputRef.current) insertFileInputRef.current.value = '';
       return;
    }

    setIsProcessing(true);
    try {
      const insertBuffer = new Uint8Array(await file.arrayBuffer());
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const insertDoc = await PDFDocument.load(insertBuffer);
      
      const copiedPages = await pdfDoc.copyPages(insertDoc, insertDoc.getPageIndices());
      copiedPages.forEach((p, idx) => pdfDoc.insertPage(insertTargetIndex + idx, p));
      
      const newPdfBytes = await pdfDoc.save();
      setOriginalPdfBuffer(newPdfBytes);
      
      const numInserted = copiedPages.length;
      setFields(fields.map(f => {
         if (f.pageIndex >= insertTargetIndex) {
            return { ...f, pageIndex: f.pageIndex + numInserted };
         }
         return f;
      }));

      setPdfTexts(pdfTexts.map(t => {
         if (t.pageIndex >= insertTargetIndex) {
            return { ...t, pageIndex: t.pageIndex + numInserted };
         }
         return t;
      }));

      setHighlights(highlights.map(h => {
         if (h.pageIndex >= insertTargetIndex) {
            return { ...h, pageIndex: h.pageIndex + numInserted };
         }
         return h;
      }));

      setShapes(shapes.map(s => {
         if (s.pageIndex >= insertTargetIndex) {
            return { ...s, pageIndex: s.pageIndex + numInserted };
         }
         return s;
      }));

      await renderPdfPages(newPdfBytes);
    } catch (error) {
       console.error(error);
       alert("Không thể chèn trang từ file PDF.");
    } finally {
       setIsProcessing(false);
       setInsertTargetIndex(null);
       if (insertFileInputRef.current) insertFileInputRef.current.value = '';
    }
  };

  const handleMovePage = async (index: number, direction: 'up' | 'down') => {
    if (!originalPdfBuffer) return;
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Việc di chuyển trang đã bị khóa để tránh làm hỏng chữ ký số.");
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) return;

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      
      const newIndices: number[] = [];
      for (let i = 0; i < pages.length; i++) {
        if (i === index) {
          // Skip for now, we will place it at targetIndex
        } else if (i === targetIndex) {
          if (direction === 'up') {
            newIndices.push(index);
            newIndices.push(targetIndex);
          } else {
            newIndices.push(targetIndex);
            newIndices.push(index);
          }
        } else {
          newIndices.push(i);
        }
      }

      const newPdfDoc = await PDFDocument.create();
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, newIndices);
      copiedPages.forEach((page) => newPdfDoc.addPage(page));
      const newPdfBytes = await newPdfDoc.save();
      
      setOriginalPdfBuffer(newPdfBytes);
      
      // Update pageIndex of fields:
      setFields(fields.map(f => {
        if (f.pageIndex === index) {
          return { ...f, pageIndex: targetIndex };
        } else if (f.pageIndex === targetIndex) {
          return { ...f, pageIndex: index };
        }
        return f;
      }));

      // Update pdfTexts:
      setPdfTexts(pdfTexts.map(t => {
        if (t.pageIndex === index) {
          return { ...t, pageIndex: targetIndex };
        } else if (t.pageIndex === targetIndex) {
          return { ...t, pageIndex: index };
        }
        return t;
      }));

      // Update highlights:
      setHighlights(highlights.map(h => {
        if (h.pageIndex === index) {
          return { ...h, pageIndex: targetIndex };
        } else if (h.pageIndex === targetIndex) {
          return { ...h, pageIndex: index };
        }
        return h;
      }));

      // Update shapes:
      setShapes(shapes.map(s => {
        if (s.pageIndex === index) {
          return { ...s, pageIndex: targetIndex };
        } else if (s.pageIndex === targetIndex) {
          return { ...s, pageIndex: index };
        }
        return s;
      }));

      await renderPdfPages(newPdfBytes);
    } catch (error) {
      console.error('Error reordering pages:', error);
      alert("Không thể di chuyển trang.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMoveMultiplePages = async (sourceIndices: number[], targetIndex: number) => {
    if (!originalPdfBuffer) return;
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Việc di chuyển trang đã bị khóa để tránh làm hỏng chữ ký số.");
      return;
    }
    if (sourceIndices.length === 0) return;
    if (sourceIndices.includes(targetIndex)) {
      alert("Vị trí đích không được trùng với các trang đang di chuyển.");
      return;
    }

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const total = pages.length;

      const remainingIndices: number[] = [];
      for (let i = 0; i < total; i++) {
        if (!sourceIndices.includes(i)) {
          remainingIndices.push(i);
        }
      }

      let insertPos = 0;
      if (targetIndex >= total) {
        insertPos = remainingIndices.length;
      } else {
        const idxInRemaining = remainingIndices.indexOf(targetIndex);
        insertPos = idxInRemaining !== -1 ? idxInRemaining : remainingIndices.length;
      }

      const newIndices = [
        ...remainingIndices.slice(0, insertPos),
        ...sourceIndices,
        ...remainingIndices.slice(insertPos)
      ];

      const newPdfDoc = await PDFDocument.create();
      const copiedPages = await newPdfDoc.copyPages(pdfDoc, newIndices);
      copiedPages.forEach((page) => newPdfDoc.addPage(page));
      const newPdfBytes = await newPdfDoc.save();
      
      setOriginalPdfBuffer(newPdfBytes);

      const indexMap = new Map<number, number>();
      newIndices.forEach((oldIdx, newIdx) => {
        indexMap.set(oldIdx, newIdx);
      });

      setFields(fields.map(f => {
        if (indexMap.has(f.pageIndex)) {
          return { ...f, pageIndex: indexMap.get(f.pageIndex)! };
        }
        return f;
      }));

      setPdfTexts(pdfTexts.map(t => {
        if (indexMap.has(t.pageIndex)) {
          return { ...t, pageIndex: indexMap.get(t.pageIndex)! };
        }
        return t;
      }));

      setHighlights(highlights.map(h => {
        if (indexMap.has(h.pageIndex)) {
          return { ...h, pageIndex: indexMap.get(h.pageIndex)! };
        }
        return h;
      }));

      setShapes(shapes.map(s => {
        if (indexMap.has(s.pageIndex)) {
          return { ...s, pageIndex: indexMap.get(s.pageIndex)! };
        }
        return s;
      }));

      setSelectedPageIndices([]);
      await renderPdfPages(newPdfBytes);
    } catch (error) {
      console.error('Error moving multiple pages:', error);
      alert("Không thể di chuyển các trang.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMultiplePages = async (indices: number[]) => {
    if (!originalPdfBuffer || indices.length === 0) return;
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Việc xóa trang đã bị khóa để tránh làm hỏng chữ ký số.");
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa ${indices.length} trang đã chọn?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      
      const sortedIndices = [...indices].sort((a, b) => b - a);
      sortedIndices.forEach(idx => {
         pdfDoc.removePage(idx);
      });
      
      const newPdfBytes = await pdfDoc.save();
      setOriginalPdfBuffer(newPdfBytes);

      const totalPages = pages.length;
      const indexMap = new Map<number, number>();
      let newIdx = 0;
      for (let i = 0; i < totalPages; i++) {
         if (!indices.includes(i)) {
            indexMap.set(i, newIdx);
            newIdx++;
         }
      }

      setFields(fields.filter(f => !indices.includes(f.pageIndex)).map(f => {
         return { ...f, pageIndex: indexMap.get(f.pageIndex)! };
      }));

      setPdfTexts(pdfTexts.filter(t => !indices.includes(t.pageIndex)).map(t => {
         return { ...t, pageIndex: indexMap.get(t.pageIndex)! };
      }));

      setHighlights(highlights.filter(h => !indices.includes(h.pageIndex)).map(h => {
         return { ...h, pageIndex: indexMap.get(h.pageIndex)! };
      }));

      setShapes(shapes.filter(s => !indices.includes(s.pageIndex)).map(s => {
         return { ...s, pageIndex: indexMap.get(s.pageIndex)! };
      }));

      setSelectedPageIndices([]);
      await renderPdfPages(newPdfBytes);
    } catch (e) {
      console.error(e);
      alert("Không thể xóa các trang này.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getNormalizedSpans = (t: PdfTextItem): TextSpan[] => {
    if (t.spans && t.spans.length > 0 && t.spans.map(s => s.text).join('') === t.text) {
      return t.spans;
    }
    return [
      {
        text: t.text,
        fontFamily: t.customFontFamily || 'Times New Roman',
        fontSize: t.customFontSize || t.fontSize,
        color: t.customColor || '#000000',
        isBold: !!t.isBold,
        isItalic: !!t.isItalic,
      },
    ];
  };

  const mergeAdjacentSpans = (spans: TextSpan[]): TextSpan[] => {
    const merged: TextSpan[] = [];
    for (const s of spans) {
      if (!s.text) continue;
      const prev = merged.length > 0 ? merged[merged.length - 1] : null;
      if (
        prev &&
        prev.fontFamily === s.fontFamily &&
        Math.abs((prev.fontSize || 12) - (s.fontSize || 12)) < 0.05 &&
        (prev.color || '#000000').toLowerCase() === (s.color || '#000000').toLowerCase() &&
        !!prev.isBold === !!s.isBold &&
        !!prev.isItalic === !!s.isItalic
      ) {
        prev.text += s.text;
      } else {
        merged.push({ ...s });
      }
    }
    return merged;
  };

  const reconcileSpansWithNewText = (t: PdfTextItem, newText: string): TextSpan[] | undefined => {
    if (!t.spans || t.spans.length === 0) return undefined;
    const oldText = t.spans.map(s => s.text).join('');
    if (oldText === newText) return t.spans;
    if (!newText) return [];

    let prefixLen = 0;
    const minLen = Math.min(oldText.length, newText.length);
    while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    let oldSuffixIdx = oldText.length;
    let newSuffixIdx = newText.length;
    while (
      oldSuffixIdx > prefixLen &&
      newSuffixIdx > prefixLen &&
      oldText[oldSuffixIdx - 1] === newText[newSuffixIdx - 1]
    ) {
      oldSuffixIdx--;
      newSuffixIdx--;
    }

    const result: TextSpan[] = [];
    let pos = 0;
    let middleStyle: Omit<TextSpan, 'text'> = {
      fontFamily: t.customFontFamily || 'Times New Roman',
      fontSize: t.customFontSize || t.fontSize,
      color: t.customColor || '#000000',
      isBold: !!t.isBold,
      isItalic: !!t.isItalic,
    };

    for (const s of t.spans) {
      const segStart = pos;
      const segEnd = pos + s.text.length;
      if (segStart <= prefixLen && prefixLen <= segEnd) {
        middleStyle = {
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          color: s.color,
          isBold: s.isBold,
          isItalic: s.isItalic,
        };
      }
      if (segStart < prefixLen) {
        const takeEnd = Math.min(segEnd, prefixLen);
        result.push({ ...s, text: s.text.slice(0, takeEnd - segStart) });
      }
      pos = segEnd;
    }

    const insertedMiddle = newText.slice(prefixLen, newSuffixIdx);
    if (insertedMiddle) {
      result.push({ ...middleStyle, text: insertedMiddle });
    }

    pos = 0;
    for (const s of t.spans) {
      const segStart = pos;
      const segEnd = pos + s.text.length;
      if (segEnd > oldSuffixIdx) {
        const takeStart = Math.max(segStart, oldSuffixIdx);
        result.push({ ...s, text: s.text.slice(takeStart - segStart) });
      }
      pos = segEnd;
    }

    return mergeAdjacentSpans(result);
  };

  const measureTextItemWidth = (t: PdfTextItem, textToMeasure?: string, spansToMeasure?: TextSpan[]): number => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const activeSpans = spansToMeasure && spansToMeasure.length > 0 ? spansToMeasure : null;
        if (activeSpans) {
          let totalW = 0;
          for (const seg of activeSpans) {
            const sz = (seg.fontSize || t.customFontSize || t.fontSize || 13) * 1.5;
            const ff = getFontFamily(seg.fontFamily || t.customFontFamily || t.fontName);
            const b = seg.isBold ?? t.isBold;
            const it = seg.isItalic ?? t.isItalic;
            ctx.font = `${it ? 'italic ' : ''}${b ? '700 ' : '400 '}${sz}px ${ff}`;
            totalW += ctx.measureText(seg.text).width;
          }
          return totalW;
        }
        const fontSize = (t.customFontSize || t.fontSize || 13) * 1.5;
        const cssFontFamily = getFontFamily(t.customFontFamily || t.fontName);
        const isBold = t.isBold;
        const isItalic = t.isItalic;
        ctx.font = `${isItalic ? 'italic ' : ''}${isBold ? '700 ' : '400 '}${fontSize}px ${cssFontFamily}`;
        return ctx.measureText(textToMeasure !== undefined ? textToMeasure : t.text).width;
      }
    } catch (e) {}
    return t.width;
  };

  const handleSaveTextEdit = (id: string, newText: string, keepOpen = false) => {
    setPdfTexts(prev => prev.map(t => {
      if (t.id === id) {
        const hasTextChanged = newText !== t.originalText;
        const hasSpans = Boolean(t.spans && t.spans.length > 0);
        const shouldBeModified = hasTextChanged || hasSpans || t.isModified;
        if (!shouldBeModified) {
          return t;
        }
        const origW = t.originalWidth || (t.pdfWidth * 1.5) || t.width;
        const nextSpans = reconcileSpansWithNewText(t, newText);
        const measuredWidth = measureTextItemWidth(t, newText, nextSpans);
        return { 
          ...t, 
          text: newText, 
          spans: nextSpans,
          isModified: true,
          originalWidth: origW,
          width: measuredWidth > 0 ? Math.max(20, measuredWidth) : t.width
        };
      }
      return t;
    }));
    if (!keepOpen) {
      setEditingTextId(null);
      setEditSelectionRange(null);
    }
  };

  const handleTextPropChange = (id: string, updates: Partial<PdfTextItem>) => {
    let liveTextareaVal: string | null = null;
    let selStart = 0;
    let selEnd = 0;
    const el = document.getElementById(`edit-textarea-${id}`) as HTMLTextAreaElement | null;
    if (el) {
      liveTextareaVal = el.value;
      selStart = el.selectionStart ?? 0;
      selEnd = el.selectionEnd ?? 0;
    }
    if (selStart === selEnd && editSelectionRange && editSelectionRange.id === id && editSelectionRange.end > editSelectionRange.start) {
      selStart = editSelectionRange.start;
      selEnd = editSelectionRange.end;
    }

    const hasFormattingUpdate =
      updates.customFontSize !== undefined ||
      updates.customColor !== undefined ||
      updates.isBold !== undefined ||
      updates.isItalic !== undefined ||
      updates.customFontFamily !== undefined;

    setPdfTexts(prev => prev.map(t => {
      if (t.id !== id) return t;
      const currentText = liveTextareaVal !== null ? liveTextareaVal : t.text;
      const syncedSpans = liveTextareaVal !== null ? reconcileSpansWithNewText(t, currentText) : t.spans;
      const workingItem: PdfTextItem = { ...t, text: currentText, spans: syncedSpans };

      // Nếu người dùng đang bôi đen 1 từ hoặc cụm từ [selStart, selEnd], chỉ áp dụng cỡ chữ / màu / in đậm / in nghiêng cho từ đó!
      if (hasFormattingUpdate && selEnd > selStart && selStart >= 0 && selEnd <= currentText.length) {
        const baseSpans = getNormalizedSpans(workingItem);
        const newSpans: TextSpan[] = [];
        let pos = 0;
        for (const seg of baseSpans) {
          const segStart = pos;
          const segEnd = pos + seg.text.length;
          if (segEnd <= selStart || segStart >= selEnd) {
            newSpans.push({ ...seg });
          } else {
            if (segStart < selStart) {
              newSpans.push({ ...seg, text: seg.text.slice(0, selStart - segStart) });
            }
            const midStart = Math.max(segStart, selStart);
            const midEnd = Math.min(segEnd, selEnd);
            const updatedSeg: TextSpan = {
              ...seg,
              text: seg.text.slice(midStart - segStart, midEnd - segStart),
            };
            if (updates.customFontFamily !== undefined) updatedSeg.fontFamily = updates.customFontFamily;
            if (updates.customFontSize !== undefined) updatedSeg.fontSize = updates.customFontSize;
            if (updates.customColor !== undefined) updatedSeg.color = updates.customColor;
            if (updates.isBold !== undefined) updatedSeg.isBold = updates.isBold;
            if (updates.isItalic !== undefined) updatedSeg.isItalic = updates.isItalic;
            newSpans.push(updatedSeg);

            if (segEnd > selEnd) {
              newSpans.push({ ...seg, text: seg.text.slice(selEnd - segStart) });
            }
          }
          pos = segEnd;
        }
        const merged = mergeAdjacentSpans(newSpans);
        const measuredW = measureTextItemWidth(workingItem, currentText, merged);
        return {
          ...workingItem,
          isModified: true,
          spans: merged,
          width: measuredW > 0 ? Math.max(20, measuredW) : workingItem.width,
          ...(updates.hasBackground !== undefined ? { hasBackground: updates.hasBackground } : {}),
        };
      }

      // Nếu không bôi đen từ riêng lẻ: áp dụng cho toàn bộ ô chữ và đồng bộ tất cả spans
      let updatedSpans = workingItem.spans;
      if (updatedSpans && updatedSpans.length > 0 && hasFormattingUpdate) {
        updatedSpans = updatedSpans.map(seg => ({
          ...seg,
          ...(updates.customFontFamily !== undefined ? { fontFamily: updates.customFontFamily } : {}),
          ...(updates.customFontSize !== undefined ? { fontSize: updates.customFontSize } : {}),
          ...(updates.customColor !== undefined ? { color: updates.customColor } : {}),
          ...(updates.isBold !== undefined ? { isBold: updates.isBold } : {}),
          ...(updates.isItalic !== undefined ? { isItalic: updates.isItalic } : {}),
        }));
      }
      const nextItem: PdfTextItem = {
        ...workingItem,
        ...updates,
        spans: updatedSpans,
      };
      const measuredW = measureTextItemWidth(nextItem, nextItem.text, nextItem.spans);
      return {
        ...nextItem,
        width: measuredW > 0 ? Math.max(20, measuredW) : nextItem.width,
      };
    }));

    if (selEnd > selStart) {
      setEditSelectionRange({ id, start: selStart, end: selEnd });
      requestAnimationFrame(() => {
        const currentEl = document.getElementById(`edit-textarea-${id}`) as HTMLTextAreaElement | null;
        if (currentEl) {
          currentEl.focus();
          currentEl.setSelectionRange(selStart, selEnd);
        }
      });
    }
  };

  const handleSplitTextIntoWords = (id: string) => {
    const target = pdfTexts.find(t => t.id === id);
    if (!target) return;
    const el = document.getElementById(`edit-textarea-${id}`) as HTMLTextAreaElement | null;
    const textContent = el ? el.value : target.text;
    const tokens = textContent.match(/\S+|\s+/g) || [];
    const wordChecks = tokens.filter(tk => tk.trim().length > 0);
    if (wordChecks.length <= 1) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const baseSizePt = target.customFontSize || target.fontSize || 12;
    const screenFontPx = baseSizePt * 1.5;
    const cssFont = getFontFamily(target.customFontFamily || target.fontName);
    if (ctx) {
      ctx.font = `${target.isItalic ? 'italic ' : ''}${target.isBold ? '700 ' : '400 '}${screenFontPx}px ${cssFont}`;
    }

    const activeSpans = getNormalizedSpans({ ...target, text: textContent });
    const getCharStyleAt = (charIdx: number): Omit<TextSpan, 'text'> => {
      let p = 0;
      for (const s of activeSpans) {
        if (charIdx >= p && charIdx < p + s.text.length) {
          return {
            fontFamily: s.fontFamily || target.customFontFamily || 'Times New Roman',
            fontSize: s.fontSize || baseSizePt,
            color: s.color || target.customColor || '#000000',
            isBold: s.isBold ?? target.isBold,
            isItalic: s.isItalic ?? target.isItalic,
          };
        }
        p += s.text.length;
      }
      return {
        fontFamily: target.customFontFamily || 'Times New Roman',
        fontSize: baseSizePt,
        color: target.customColor || '#000000',
        isBold: target.isBold,
        isItalic: target.isItalic,
      };
    };

    const rad = ((target.rotation || 0) * Math.PI) / 180;
    const pageRot = pages[target.pageIndex]?.pageRotation || 0;
    const screenRad = (((target.rotation || 0) - pageRot) * Math.PI) / 180;

    const newItems: PdfTextItem[] = [];
    let curOffsetPx = 0;
    let charCursor = 0;
    let wordCounter = 0;

    for (const tk of tokens) {
      const st = getCharStyleAt(charCursor);
      const tkSizePx = (st.fontSize || baseSizePt) * 1.5;
      if (ctx) {
        ctx.font = `${st.isItalic ? 'italic ' : ''}${st.isBold ? '700 ' : '400 '}${tkSizePx}px ${getFontFamily(st.fontFamily || 'Times New Roman')}`;
      }
      const tkWidthPx = ctx ? ctx.measureText(tk).width : tk.length * (tkSizePx * 0.52);

      if (tk.trim().length > 0) {
        const offsetPt = curOffsetPx / 1.5;
        const wordWidthPt = tkWidthPx / 1.5;
        const newId = `${target.id}-w${wordCounter}-${Date.now().toString(36)}`;
        newItems.push({
          ...target,
          id: newId,
          text: tk,
          originalText: tk,
          x: target.x + (target.offsetX || 0) + curOffsetPx * Math.cos(screenRad),
          y: target.y + (target.offsetY || 0) + curOffsetPx * Math.sin(screenRad),
          baselineY: (target.baselineY ?? (target.y + target.height * 0.82)) + curOffsetPx * Math.sin(screenRad),
          width: Math.max(10, tkWidthPx),
          originalWidth: Math.max(10, tkWidthPx),
          pdfX: target.pdfX + ((target.offsetX || 0) / 1.5) + offsetPt * Math.cos(rad),
          pdfY: target.pdfY - ((target.offsetY || 0) / 1.5) + offsetPt * Math.sin(rad),
          pdfWidth: Math.max(6, wordWidthPt),
          pdfHeight: st.fontSize || baseSizePt,
          fontSize: st.fontSize || baseSizePt,
          customFontFamily: st.fontFamily || target.customFontFamily,
          customFontSize: st.fontSize || baseSizePt,
          customColor: st.color || target.customColor || '#000000',
          isBold: !!st.isBold,
          isItalic: !!st.isItalic,
          offsetX: 0,
          offsetY: 0,
          isModified: true,
          hasBackground: true,
          spans: undefined,
        });
        wordCounter++;
      }

      curOffsetPx += tkWidthPx;
      charCursor += tk.length;
    }

    if (newItems.length > 0) {
      setPdfTexts(prev => {
        const idx = prev.findIndex(item => item.id === id);
        if (idx === -1) return prev;
        const copy = [...prev];
        copy.splice(idx, 1, ...newItems);
        return copy;
      });
      setSelectedTextId(newItems[0].id);
      setEditingTextId(newItems[0].id);
      setEditSelectionRange(null);
    }
  };

  const handleRestoreText = (id: string) => {
    setPdfTexts(pdfTexts.map(t => {
      if (t.id === id) {
        return { 
          ...t, 
          text: t.originalText, 
          width: (t as any).originalWidth || t.width,
          isModified: false,
          offsetX: 0,
          offsetY: 0,
          hasBackground: true,
          rotation: t.rotation || 0,
          spans: undefined,
        };
      }
      return t;
    }));
    setEditingTextId(null);
    setEditSelectionRange(null);
  };

  const handleMouseDown = (e: React.MouseEvent, pageIndex: number) => {
    if (isDigitallySigned) {
      setSelectedFieldId(null);
      setSelectedHighlightId(null);
      setSelectedTextBoxId(null);
      setEditingTextBoxId(null);
      setSelectedImageId(null);
      return;
    }
    if (activeTool === 'Select') {
      setSelectedFieldId(null);
      setSelectedHighlightId(null);
      setSelectedTextBoxId(null);
      setEditingTextBoxId(null);
      setSelectedShapeId(null);
      setSelectedImageId(null);
      return;
    }
    if (activeTool !== 'Signature Field' && activeTool !== 'Highlight' && activeTool !== 'Text Box' && activeTool !== 'Rectangle' && activeTool !== 'Circle') return;
    
    setSelectedFieldId(null);
    setSelectedHighlightId(null);
    setSelectedTextBoxId(null);
    setEditingTextBoxId(null);
    setSelectedShapeId(null);
    setSelectedImageId(null);
    const pageElement = e.currentTarget as HTMLDivElement;
    const rect = pageElement.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setDrawing({ pageIndex, startX: x, startY: y, currentX: x, currentY: y });
  };

  const handleResizeDown = (e: React.MouseEvent, f: Field, type: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
      if (isDigitallySigned) return;
      e.stopPropagation();
      const pageElement = (e.currentTarget as HTMLElement).closest('[id^="page-"]') as HTMLDivElement;
      if (pageElement) {
          const rect = pageElement.getBoundingClientRect();
          const startX = (e.clientX - rect.left) / zoom;
          const startY = (e.clientY - rect.top) / zoom;
          setFieldInteraction({
              id: f.id,
              type,
              startX,
              startY,
              originalX: f.x,
              originalY: f.y,
              originalWidth: f.width,
              originalHeight: f.height,
              pageIndex: f.pageIndex
          });
      }
  };

  const handleShapeResizeDown = (e: React.MouseEvent, sh: ShapeItem, type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    if (isDigitallySigned) return;
    e.stopPropagation();
    const pageElement = (e.currentTarget as HTMLElement).closest('[id^="page-"]') as HTMLDivElement;
    if (pageElement) {
      const rect = pageElement.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoom;
      const startY = (e.clientY - rect.top) / zoom;
      setShapeInteraction({
        id: sh.id,
        type,
        startX,
        startY,
        originalX: sh.x,
        originalY: sh.y,
        originalWidth: sh.width,
        originalHeight: sh.height,
        pageIndex: sh.pageIndex
      });
      setSelectedShapeId(sh.id);
    }
  };

  const handleImageResizeDown = (e: React.MouseEvent, img: PdfImageItem, type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    if (isDigitallySigned) return;
    e.stopPropagation();
    const pageElement = (e.currentTarget as HTMLElement).closest('[id^="page-"]') as HTMLDivElement;
    if (pageElement) {
      const rect = pageElement.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoom;
      const startY = (e.clientY - rect.top) / zoom;
      setImageInteraction({
        id: img.id,
        type,
        startX,
        startY,
        originalX: img.x,
        originalY: img.y,
        originalWidth: img.width,
        originalHeight: img.height,
        pageIndex: img.pageIndex,
        aspectRatio: img.aspectRatio || (img.width / Math.max(1, img.height)),
      });
      setSelectedImageId(img.id);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Không thể chèn ảnh.");
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const imgEl = new window.Image();
      imgEl.onload = () => {
        const natW = Math.max(1, imgEl.naturalWidth || imgEl.width || 200);
        const natH = Math.max(1, imgEl.naturalHeight || imgEl.height || 200);
        const aspect = natW / natH;

        const canvas = document.createElement('canvas');
        canvas.width = natW;
        canvas.height = natH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imgEl, 0, 0, natW, natH);
        }
        const pngDataUrl = canvas.toDataURL('image/png');

        const targetPageIdx = Math.max(0, Math.min((pages.length || 1) - 1, currentPage - 1));
        const targetPage = pages[targetPageIdx];
        const pageW = targetPage ? targetPage.width : 800;
        const pageH = targetPage ? targetPage.height : 1131;

        const maxInitW = Math.min(240, pageW * 0.4);
        const maxInitH = Math.min(240, pageH * 0.4);
        let initW = natW;
        let initH = natH;
        if (initW > maxInitW) {
          initW = maxInitW;
          initH = initW / aspect;
        }
        if (initH > maxInitH) {
          initH = maxInitH;
          initW = initH * aspect;
        }
        initW = Math.max(40, Math.round(initW));
        initH = Math.max(40, Math.round(initH));

        const initX = Math.max(20, Math.round((pageW - initW) / 2));
        const initY = Math.max(20, Math.round(Math.min(pageH - initH - 20, pageH * 0.25)));

        const newId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        setImages(prev => [
          ...prev,
          {
            id: newId,
            pageIndex: targetPageIdx,
            x: initX,
            y: initY,
            width: initW,
            height: initH,
            dataUrl: pngDataUrl,
            aspectRatio: aspect,
          },
        ]);
        setSelectedImageId(newId);
        setSelectedFieldId(null);
        setSelectedHighlightId(null);
        setSelectedTextBoxId(null);
        setSelectedShapeId(null);
        setSelectedTextId(null);
        setActiveTool('Select');
      };
      imgEl.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleTextBoxResizeDown = (e: React.MouseEvent, tb: TextBoxItem, type: 'drag' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    if (isDigitallySigned) return;
    e.stopPropagation();
    const pageElement = (e.currentTarget as HTMLElement).closest('[id^="page-"]') as HTMLDivElement;
    if (pageElement) {
      const rect = pageElement.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoom;
      const startY = (e.clientY - rect.top) / zoom;
      setTextBoxInteraction({
        id: tb.id,
        type,
        startX,
        startY,
        originalX: tb.x,
        originalY: tb.y,
        originalWidth: tb.width,
        originalHeight: tb.height,
        pageIndex: tb.pageIndex
      });
      setSelectedTextBoxId(tb.id);
    }
  };

  const handleMouseUp = () => {
    if (fieldInteraction) {
      setFieldInteraction(null);
      return;
    }
    if (highlightInteraction) {
      setHighlightInteraction(null);
      return;
    }
    if (textBoxInteraction) {
      setTextBoxInteraction(null);
      return;
    }
    if (shapeInteraction) {
      setShapeInteraction(null);
      return;
    }
    if (imageInteraction) {
      setImageInteraction(null);
      return;
    }
    
    if (!drawing) return;

    if (activeTool === 'Rectangle' || activeTool === 'Circle') {
      const width = Math.abs(drawing.currentX - drawing.startX);
      const height = Math.abs(drawing.currentY - drawing.startY);
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);

      // Chỉ tạo ô vuông / khoanh vùng khi người dùng nhấn giữ và kéo chuột (không tự tạo khi chỉ click chuột)
      if (width < 8 || height < 8) {
        setDrawing(null);
        return;
      }

      const newId = `shape-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const targetType = activeTool === 'Circle' ? 'circle' : 'rectangle';
      setShapes(prev => [...prev, {
        id: newId,
        pageIndex: drawing.pageIndex,
        type: targetType,
        x,
        y,
        width,
        height,
        strokeColor: shapeStrokeColor,
        strokeWidth: shapeStrokeWidth,
        strokeStyle: shapeStrokeStyle,
        fillColor: shapeFill,
      }]);
      setSelectedShapeId(newId);
      setDrawing(null);
      return;
    }

    if (activeTool === 'Text Box') {
      const width = Math.abs(drawing.currentX - drawing.startX);
      const height = Math.abs(drawing.currentY - drawing.startY);
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);

      // Chỉ tạo khung thêm chữ khi người dùng nhấn giữ và kéo chuột (không tự tạo khi chỉ click chuột)
      if (width < 10 || height < 10) {
        setDrawing(null);
        return;
      }

      const newId = `tb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setTextBoxes(prev => [...prev, {
        id: newId,
        pageIndex: drawing.pageIndex,
        x,
        y,
        width,
        height,
        text: 'Nhập nội dung chữ...',
        fontFamily: tbFontFamily,
        fontSize: tbFontSize,
        lineHeight: tbLineHeight,
        isBold: tbIsBold,
        isItalic: tbIsItalic,
        color: tbColor,
        textAlign: tbTextAlign,
        hasBackground: tbHasBackground,
        hasBorder: tbHasBorder,
      }]);
      setSelectedTextBoxId(newId);
      setEditingTextBoxId(newId);
      setDrawing(null);
      ensureFontsLoaded();
      return;
    }

    if (activeTool === 'Highlight') {
      let width = Math.abs(drawing.currentX - drawing.startX);
      let height = Math.abs(drawing.currentY - drawing.startY);
      let x = Math.min(drawing.startX, drawing.currentX);
      let y = Math.min(drawing.startY, drawing.currentY);
      
      if (width < 5 || height < 5) {
        // Single click: find if clicked over a text item on this page
        const clickedText = pdfTexts.find(t => 
          t.pageIndex === drawing.pageIndex &&
          x >= t.x - 6 && x <= t.x + t.width + 6 &&
          y >= t.y - 6 && y <= t.y + t.height + 6
        );
        if (clickedText) {
          x = clickedText.x - 2;
          y = clickedText.y;
          width = clickedText.width + 4;
          height = Math.max(clickedText.height, clickedText.fontSize * 1.35);
        } else {
          width = 120;
          height = 22;
        }
      }

      if (width > 3 && height > 3) {
        const newId = `hl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const isEraser = highlightToolMode === 'eraser';
        setHighlights(prev => [...prev, {
          id: newId,
          pageIndex: drawing.pageIndex,
          x,
          y,
          width,
          height,
          color: isEraser ? '#ffffff' : highlightColor,
          opacity: isEraser ? 1 : highlightOpacity,
          isWhiteout: isEraser,
        }]);
        setSelectedHighlightId(newId);
      }
      setDrawing(null);
      return;
    }
    
    let width = Math.abs(drawing.currentX - drawing.startX);
    let height = Math.abs(drawing.currentY - drawing.startY);
    let x = Math.min(drawing.startX, drawing.currentX);
    let y = Math.min(drawing.startY, drawing.currentY);
    
    if (width < 5 || height < 5) {
      width = 120;
      height = 50;
    }
    
    if (width > 5 && height > 5) {
      const newId = Math.random().toString(36).substring(2, 9);
      if (activeTool === 'Signature Field') {
        const defaultName = `Signature${fields.filter(f => f.type === 'signature').length + 1}`;
        setFields([...fields, {
          id: newId,
          pageIndex: drawing.pageIndex,
          x, y, width, height,
          type: 'signature',
          name: defaultName,
          originalName: defaultName,
        }]);
        setSelectedFieldId(newId);
      }
    }
    
    setDrawing(null);
  };

  const deleteField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const exportToPDF = async (customFilename?: string) => {
    if (!originalPdfBuffer) {
      alert("Vui lòng nhập tài liệu PDF trước khi xuất.");
      return;
    }
    
    setIsProcessing(true);
    try {
      // Ensure all custom fonts are loaded before we proceed to embed them
      const loadedFonts = await ensureFontsLoaded();
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      
      // Register fontkit to support custom TrueType fonts for Vietnamese Unicode
      pdfDoc.registerFontkit(fontkit);
      
      // Fallback strategy: create safe, guaranteed TrueType font buffers supporting Vietnamese Unicode
      const safeSerifRegular = loadedFonts?.serifRegular || fontsRef.current.serifRegular || fontSerifRegular || vietnameseFontBytes || fontSansRegular;
      const safeSerifBold = loadedFonts?.serifBold || fontsRef.current.serifBold || fontSerifBold || safeSerifRegular;
      const safeSerifItalic = loadedFonts?.serifItalic || fontsRef.current.serifItalic || fontSerifItalic || safeSerifRegular;
      const safeSerifBoldItalic = loadedFonts?.serifBoldItalic || fontsRef.current.serifBoldItalic || fontSerifBoldItalic || safeSerifItalic || safeSerifBold;

      const safeSansRegular = loadedFonts?.sansRegular || fontsRef.current.sansRegular || fontSansRegular || vietnameseFontBytes || fontSerifRegular;
      const safeSansBold = loadedFonts?.sansBold || fontsRef.current.sansBold || fontSansBold || safeSansRegular;
      const safeSansItalic = loadedFonts?.sansItalic || fontsRef.current.sansItalic || fontSansItalic || safeSansRegular;
      const safeSansBoldItalic = loadedFonts?.sansBoldItalic || fontsRef.current.sansBoldItalic || fontSansBoldItalic || safeSansItalic || safeSansBold;

      // Embed all custom fonts for high-quality Vietnamese text
      const embeddedSerifRegular = safeSerifRegular ? await pdfDoc.embedFont(safeSerifRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRoman);
      const embeddedSerifBold = safeSerifBold ? await pdfDoc.embedFont(safeSerifBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanBold);
      const embeddedSerifItalic = safeSerifItalic ? await pdfDoc.embedFont(safeSerifItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanItalic);
      const embeddedSerifBoldItalic = safeSerifBoldItalic ? await pdfDoc.embedFont(safeSerifBoldItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanBoldItalic);
      
      const embeddedSansRegular = safeSansRegular ? await pdfDoc.embedFont(safeSansRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
      const embeddedSansBold = safeSansBold ? await pdfDoc.embedFont(safeSansBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const embeddedSansItalic = safeSansItalic ? await pdfDoc.embedFont(safeSansItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaOblique);
      const embeddedSansBoldItalic = safeSansBoldItalic ? await pdfDoc.embedFont(safeSansBoldItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBoldOblique);

      const hexToRgb = (hex: string) => {
        const cleanHex = (hex || '#000000').replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return pdfLib.rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
      };

      const form = pdfDoc.getForm();
      const pdfPages = pdfDoc.getPages();
      
      // Apply existing text modifications (Whiteout old text and redraw new text)
      const modifiedTexts = pdfTexts.filter(t => t.isModified);
      for (const t of modifiedTexts) {
         if (t.pageIndex < pdfPages.length) {
            const page = pdfPages[t.pageIndex];
            
            // Map offsets: 1 PDF point = 1.5 screen pixels
            const pdfOffsetX = (t.offsetX || 0) / 1.5;
            const pdfOffsetY = -(t.offsetY || 0) / 1.5;

            const finalPdfX = t.pdfX + pdfOffsetX;
            const finalPdfY = t.pdfY + pdfOffsetY;
            const fontSizeToUse = t.customFontSize || t.pdfHeight;

            // Draw white box to whiteout/erase old text if hasBackground is true
            const selectFontForProps = (fam: string, bold?: boolean, italic?: boolean) => {
              const cleanFam = getCleanFontDisplayName(fam);
              const sans = cleanFam === 'Arial' || cleanFam === 'Roboto';
              if (sans) {
                if (bold && italic) return embeddedSansBoldItalic;
                if (italic) return embeddedSansItalic;
                if (bold) return embeddedSansBold;
                return embeddedSansRegular;
              }
              if (bold && italic) return embeddedSerifBoldItalic;
              if (italic) return embeddedSerifItalic;
              if (bold) return embeddedSerifBold;
              return embeddedSerifRegular;
            };

            const fontToUse = selectFontForProps(t.customFontFamily || t.fontName || '', t.isBold, t.isItalic);
            const activeSpans = getNormalizedSpans(t);
            const maxSpanFontSize = Math.max(fontSizeToUse, ...activeSpans.map(s => s.fontSize || fontSizeToUse));

            // Draw white box to whiteout/erase old text if hasBackground is true
            if (t.hasBackground !== false) {
              const origBoxH = Math.max(t.pdfHeight, maxSpanFontSize);
              // 1. Erase original text span completely
              page.drawRectangle({
                x: t.pdfX - 1.5,
                y: t.pdfY - origBoxH * 0.26,
                width: t.pdfWidth * 1.04 + 3,
                height: origBoxH * 1.34,
                color: pdfLib.rgb(1, 1, 1),
                rotate: pdfLib.degrees(t.rotation || 0),
              });

              // 2. Also cover new text span if nudged or wider
              let newTextWidthInPdf = 0;
              try {
                for (const seg of activeSpans) {
                  const segFont = selectFontForProps(seg.fontFamily || t.customFontFamily || t.fontName || '', seg.isBold ?? t.isBold, seg.isItalic ?? t.isItalic);
                  const segSize = seg.fontSize || fontSizeToUse;
                  newTextWidthInPdf += segFont.widthOfTextAtSize(seg.text, segSize);
                }
              } catch (e) {}
              if (newTextWidthInPdf > 0) {
                page.drawRectangle({
                  x: finalPdfX - 1,
                  y: finalPdfY - maxSpanFontSize * 0.25,
                  width: newTextWidthInPdf + 2,
                  height: maxSpanFontSize * 1.32,
                  color: pdfLib.rgb(1, 1, 1),
                  rotate: pdfLib.degrees(t.rotation || 0),
                });
              }
            }

            // Draw new edited text (supports per-word font size, color, bold, italic via spans)
            if (t.text) {
              const rad = ((t.rotation || 0) * Math.PI) / 180;
              let curX = finalPdfX;
              let curY = finalPdfY;
              for (const seg of activeSpans) {
                if (!seg.text) continue;
                const segFont = selectFontForProps(seg.fontFamily || t.customFontFamily || t.fontName || '', seg.isBold ?? t.isBold, seg.isItalic ?? t.isItalic);
                const segSize = seg.fontSize || fontSizeToUse;
                const segColor = hexToRgb(seg.color || t.customColor || '#000000');
                try {
                  page.drawText(seg.text, {
                    x: curX,
                    y: curY,
                    size: segSize,
                    font: segFont,
                    color: segColor,
                    rotate: pdfLib.degrees(t.rotation || 0),
                  });
                } catch (e) {}
                let segW = seg.text.length * (segSize * 0.5);
                try {
                  segW = segFont.widthOfTextAtSize(seg.text, segSize);
                } catch (e) {}
                curX += segW * Math.cos(rad);
                curY += segW * Math.sin(rad);
              }
            }
         }
      }

      // Clean up fields that were previously present or are being overwritten/renamed
      const namesToRemove = new Set<string>(initialFieldNames);
      fields.forEach(f => {
        if (f.originalName) namesToRemove.add(f.originalName);
        namesToRemove.add(f.name);
        namesToRemove.add(f.id);
      });
      namesToRemove.forEach(fieldName => {
        safeRemoveField(pdfDoc, fieldName);
      });

      let hasSig = false;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.pageIndex < pdfPages.length) {
          const page = pdfPages[f.pageIndex];
          const { width, height } = page.getSize();
          
          let angle = 0;
          try {
            const rot = page.getRotation();
            if (rot && typeof rot.angle === 'number') {
              angle = rot.angle;
            } else if (typeof rot === 'number') {
              angle = rot;
            }
          } catch (e) {
            console.error("Error getting page rotation", e);
          }
          angle = (angle % 360 + 360) % 360;

          let visibleWidth = width;
          let visibleHeight = height;
          let boxX = 0;
          let boxY = 0;
          try {
            const cropBox = page.getCropBox();
            if (cropBox) {
              boxX = cropBox.x || 0;
              boxY = cropBox.y || 0;
              visibleWidth = cropBox.width;
              visibleHeight = cropBox.height;
            }
          } catch (e) {
            console.error("Error getting cropbox", e);
          }

          const parsedPage = pages[f.pageIndex];
          const canvasWidth = parsedPage.width;
          const canvasHeight = parsedPage.height;
          
          let fieldX = 0;
          let fieldY = 0;
          let fieldWidth = 0;
          let fieldHeight = 0;

          if (angle === 90) {
            const scaleX = visibleHeight / canvasWidth;
            const scaleY = visibleWidth / canvasHeight;
            
            fieldX = boxX + (f.y * scaleY);
            fieldY = boxY + (f.x * scaleX);
            fieldWidth = f.height * scaleY;
            fieldHeight = f.width * scaleX;
          } else if (angle === 180) {
            const scaleX = visibleWidth / canvasWidth;
            const scaleY = visibleHeight / canvasHeight;
            
            fieldX = boxX + (visibleWidth - (f.x + f.width) * scaleX);
            fieldY = boxY + (f.y * scaleY);
            fieldWidth = f.width * scaleX;
            fieldHeight = f.height * scaleY;
          } else if (angle === 270) {
            const scaleX = visibleHeight / canvasWidth;
            const scaleY = visibleWidth / canvasHeight;
            
            fieldX = boxX + (visibleWidth - (f.y + f.height) * scaleY);
            fieldY = boxY + (visibleHeight - (f.x + f.width) * scaleX);
            fieldWidth = f.height * scaleY;
            fieldHeight = f.width * scaleX;
          } else {
            const scaleX = visibleWidth / canvasWidth;
            const scaleY = visibleHeight / canvasHeight;
            
            fieldX = boxX + (f.x * scaleX);
            fieldY = boxY + (visibleHeight - (f.y + f.height) * scaleY);
            fieldWidth = f.width * scaleX;
            fieldHeight = f.height * scaleY;
          }

          console.log("Calculated signature position:", {
            angle,
            visibleWidth,
            visibleHeight,
            boxX,
            boxY,
            canvasWidth,
            canvasHeight,
            input: { x: f.x, y: f.y, w: f.width, h: f.height },
            output: { x: fieldX, y: fieldY, w: fieldWidth, h: fieldHeight }
          });
          
          if (f.type === 'signature') {
            const signatureFields: any = {
              Type: 'Annot',
              Subtype: 'Widget',
              FT: 'Sig',
              Rect: [fieldX, fieldY, fieldX + fieldWidth, fieldY + fieldHeight],
              T: pdfLib.PDFString.of(f.name),
              F: 4, 
              P: page.ref,
            };

            if (angle !== 0) {
              signatureFields.MK = pdfDoc.context.obj({
                R: angle
              });
            }

            const signatureDict = pdfDoc.context.obj(signatureFields);
            const signatureRef = pdfDoc.context.register(signatureDict);
            page.node.addAnnot(signatureRef);
            form.acroForm.addField(signatureRef);
            hasSig = true;
          } else if (f.type === 'text') {
            try {
              const textField = form.createTextField(f.id);
              textField.setText(f.textValue || '');
              
              textField.addToPage(page, {
                x: fieldX,
                y: fieldY,
                width: fieldWidth,
                height: fieldHeight,
              });
              
              if (f.fontSize) {
                textField.setFontSize(f.fontSize);
              }
            } catch (err) {
              console.error("Error creating text field:", err);
            }
          }
        }
      }
      
      if (hasSig) {
        form.acroForm.dict.set(pdfLib.PDFName.of('SigFlags'), pdfLib.PDFNumber.of(3));
      }

      // Draw all highlight boxes onto exported PDF pages
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const { width, height } = page.getSize();
        
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {
          // ignore
        }

        let angle = 0;
        try {
          const rotVal = page.getRotation();
          if (rotVal && typeof rotVal.angle === 'number') {
            angle = rotVal.angle;
          } else if (typeof rotVal === 'number') {
            angle = rotVal;
          }
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const parsedPage = pages[pIdx];
        if (!parsedPage) continue;

        const { m, width: effW, height: effH, rot } = getPageTransformMatrix(
          [boxX, boxY, boxX + visibleWidth, boxY + visibleHeight],
          angle
        );
        const scaleX = effW / parsedPage.width;
        const scaleY = effH / parsedPage.height;

        // Clean out any previous /Highlight annotations on this page so deleted ones are permanently removed
        const annots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (annots && typeof (annots as any).size === 'function') {
          const remaining: any[] = [];
          for (let aIdx = 0; aIdx < (annots as any).size(); aIdx++) {
            const annotRef = (annots as any).get(aIdx);
            const annot = (annots as any).lookup(aIdx);
            const subtype = annot?.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Highlight') {
              remaining.push(annotRef);
            }
          }
          page.node.set(pdfLib.PDFName.of('Annots'), pdfDoc.context.obj(remaining));
        }

        const pageHighlights = highlights.filter(h => h.pageIndex === pIdx);
        for (const h of pageHighlights) {
          const bl = screenToPdfPoint(h.x * scaleX, (h.y + h.height) * scaleY, m);
          const pdfHlW = h.width * scaleX;
          const pdfHlH = h.height * scaleY;

          if (h.isWhiteout) {
            // Whiteout covers the old baked yellow stain with white
            page.drawRectangle({
              x: bl.x,
              y: bl.y,
              width: pdfHlW,
              height: pdfHlH,
              color: pdfLib.rgb(1, 1, 1),
              rotate: pdfLib.degrees(rot),
            });

            // Redraw crisp text inside this whiteout box so text remains visible and sharp
            const overlappingTexts = pdfTexts.filter(t => 
              t.pageIndex === pIdx && !t.isModified &&
              t.x + t.width >= h.x - 2 && t.x <= h.x + h.width + 2 &&
              t.y + t.height >= h.y - 2 && t.y <= h.y + h.height + 2
            );

            for (const t of overlappingTexts) {
              const fontNameLower = (t.customFontFamily || t.fontName || '').toLowerCase();
              const isSans = fontNameLower.includes('sans') || fontNameLower.includes('arial') || fontNameLower.includes('roboto') || fontNameLower.includes('helvetica') || fontNameLower.includes('calibri');
              let fontToUse;
              if (isSans) {
                if (t.isBold) fontToUse = embeddedSansBold;
                else if (t.isItalic) fontToUse = embeddedSansItalic;
                else fontToUse = embeddedSansRegular;
              } else {
                if (t.isBold) fontToUse = embeddedSerifBold;
                else if (t.isItalic) fontToUse = embeddedSerifItalic;
                else fontToUse = embeddedSerifRegular;
              }

              const fontSizeToUse = t.customFontSize || t.pdfHeight;
              const finalPdfX = t.pdfX;
              const finalPdfY = t.pdfY;

              try {
                page.drawText(t.text, {
                  x: finalPdfX,
                  y: finalPdfY,
                  size: fontSizeToUse,
                  font: fontToUse,
                  color: hexToRgb(t.customColor || '#000000'),
                  rotate: pdfLib.degrees(t.rotation || 0),
                });
              } catch (drawErr) {
                // ignore
              }
            }
          } else {
            // Standard PDF Highlight Annotation (non-destructive, interactive in Foxit/Adobe/etc.)
            const rgb = hexToRgb(h.color || '#fde047');
            const tl = screenToPdfPoint(h.x * scaleX, h.y * scaleY, m);
            const tr = screenToPdfPoint((h.x + h.width) * scaleX, h.y * scaleY, m);
            const blPt = screenToPdfPoint(h.x * scaleX, (h.y + h.height) * scaleY, m);
            const brPt = screenToPdfPoint((h.x + h.width) * scaleX, (h.y + h.height) * scaleY, m);
            const minX = Math.min(tl.x, tr.x, blPt.x, brPt.x);
            const maxX = Math.max(tl.x, tr.x, blPt.x, brPt.x);
            const minY = Math.min(tl.y, tr.y, blPt.y, brPt.y);
            const maxY = Math.max(tl.y, tr.y, blPt.y, brPt.y);

            const annotDict = pdfDoc.context.obj({
              Type: 'Annot',
              Subtype: 'Highlight',
              Rect: [minX, minY, maxX, maxY],
              C: [rgb.red, rgb.green, rgb.blue],
              CA: h.opacity || 0.45,
              QuadPoints: [
                tl.x, tl.y,
                tr.x, tr.y,
                blPt.x, blPt.y,
                brPt.x, brPt.y,
              ],
              F: 4,
            });
            const annotRef = pdfDoc.context.register(annotDict);
            let currentAnnots = page.node.lookup(pdfLib.PDFName.of('Annots'));
            if (!currentAnnots || typeof (currentAnnots as any).push !== 'function') {
              const newAnnots = pdfDoc.context.obj([]);
              page.node.set(pdfLib.PDFName.of('Annots'), newAnnots);
              currentAnnots = newAnnots;
            }
            (currentAnnots as any).push(annotRef);
          }
        }
      }

      // Clean out any previous /FreeText annotations on each page
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const annots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (annots && typeof (annots as any).size === 'function') {
          const remaining: any[] = [];
          for (let aIdx = 0; aIdx < (annots as any).size(); aIdx++) {
            const annotRef = (annots as any).get(aIdx);
            const annot = (annots as any).lookup(aIdx);
            const subtype = annot?.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/FreeText') {
              remaining.push(annotRef);
            }
          }
          page.node.set(pdfLib.PDFName.of('Annots'), pdfDoc.context.obj(remaining));
        }
      }

      // 1. Erase any text boxes that were originally present in the imported PDF but were deleted
      for (const dtb of deletedTextBoxes) {
        if (dtb.pageIndex < pdfPages.length) {
          const page = pdfPages[dtb.pageIndex];
          const parsedPage = pages[dtb.pageIndex];
          if (!parsedPage) continue;
          const { width, height } = page.getSize();
          let boxX = 0;
          let boxY = 0;
          let visibleWidth = width;
          let visibleHeight = height;
          try {
            const cropBox = page.getCropBox();
            if (cropBox) {
              boxX = cropBox.x || 0;
              boxY = cropBox.y || 0;
              visibleWidth = cropBox.width;
              visibleHeight = cropBox.height;
            }
          } catch (e) {}

          let angle = 0;
          try {
            const rotVal = page.getRotation();
            if (rotVal && typeof rotVal.angle === 'number') {
              angle = rotVal.angle;
            } else if (typeof rotVal === 'number') {
              angle = rotVal;
            }
          } catch (e) {}
          angle = (angle % 360 + 360) % 360;

          const { m, width: effW, height: effH, rot } = getPageTransformMatrix(
            [boxX, boxY, boxX + visibleWidth, boxY + visibleHeight],
            angle
          );
          const scaleX = effW / parsedPage.width;
          const scaleY = effH / parsedPage.height;

          const bl = screenToPdfPoint((dtb.x - 1) * scaleX, (dtb.y + dtb.height + 1) * scaleY, m);
          page.drawRectangle({
            x: bl.x,
            y: bl.y,
            width: (dtb.width + 2) * scaleX,
            height: (dtb.height + 2) * scaleY,
            color: pdfLib.rgb(1, 1, 1),
            rotate: pdfLib.degrees(rot),
          });
        }
      }

      // 2. Export active text boxes directly to the PDF page with TrueType embedded fonts
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const { width, height } = page.getSize();
        
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {}

        let angle = 0;
        try {
          const rotVal = page.getRotation();
          if (rotVal && typeof rotVal.angle === 'number') {
            angle = rotVal.angle;
          } else if (typeof rotVal === 'number') {
            angle = rotVal;
          }
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const parsedPage = pages[pIdx];
        if (!parsedPage) continue;
        const canvasWidth = parsedPage.width;
        const canvasHeight = parsedPage.height;

        const effectiveViewBox: [number, number, number, number] = parsedPage.viewBox || [
          boxX,
          boxY,
          boxX + visibleWidth,
          boxY + visibleHeight,
        ];
        const effectiveAngle = typeof parsedPage.pageRotation === 'number' ? parsedPage.pageRotation : angle;

        const { m, width: effW, height: effH, rot } = getPageTransformMatrix(
          effectiveViewBox,
          effectiveAngle
        );
        const scaleX = effW / canvasWidth;
        const scaleY = effH / canvasHeight;

        const pageTextBoxes = textBoxes.filter(tb => tb.pageIndex === pIdx);
        for (const tb of pageTextBoxes) {
          const blScreen = {
            x: tb.x * scaleX,
            y: (tb.y + tb.height) * scaleY,
          };
          const pdfBl = screenToPdfPoint(blScreen.x, blScreen.y, m);
          const pdfBoxW = tb.width * scaleX;
          const pdfBoxH = tb.height * scaleY;

          // If the box was originally loaded from PDF and moved, erase its old position
          const initialTb = initialLoadedTextBoxesRef.current.find(itb => itb.id === tb.id);
          if (initialTb && (Math.abs(initialTb.x - tb.x) > 2 || Math.abs(initialTb.y - tb.y) > 2)) {
            const oldBlScreen = {
              x: (initialTb.x - 1) * scaleX,
              y: (initialTb.y + initialTb.height + 1) * scaleY,
            };
            const oldPdfBl = screenToPdfPoint(oldBlScreen.x, oldBlScreen.y, m);
            page.drawRectangle({
              x: oldPdfBl.x,
              y: oldPdfBl.y,
              width: (initialTb.width + 2) * scaleX,
              height: (initialTb.height + 2) * scaleY,
              color: pdfLib.rgb(1, 1, 1),
              rotate: pdfLib.degrees(rot),
            });
          }

          const textColor = hexToRgb(tb.color || '#000000');
          const selectTbFont = (ffName: string, bold?: boolean, italic?: boolean) => {
            const cleanFam = getCleanFontDisplayName(ffName);
            const isSans = cleanFam === 'Arial' || cleanFam === 'Roboto';
            if (isSans) {
              if (bold && italic) return embeddedSansBoldItalic;
              if (italic) return embeddedSansItalic;
              if (bold) return embeddedSansBold;
              return embeddedSansRegular;
            }
            if (bold && italic) return embeddedSerifBoldItalic;
            if (italic) return embeddedSerifItalic;
            if (bold) return embeddedSerifBold;
            return embeddedSerifRegular;
          };

          const spanLines = tb.text && tb.text.trim() ? wrapTextBoxSpansToLines(tb) : [];
          const activeTbSpans = getNormalizedTextBoxSpans(tb);
          const maxSpanSizePt = Math.max(
            tb.fontSize || 12,
            ...activeTbSpans.map(s => s.fontSize || tb.fontSize || 12)
          );
          const baseFontSizeToUse = (maxSpanSizePt * 1.5) * ((scaleX + scaleY) / 2);
          const lineHeightMult = tb.lineHeight || 1.25;
          const lineHeight = baseFontSizeToUse * lineHeightMult;

          const actualBoxHeightScreen = Math.max(
            tb.height,
            spanLines.length * (maxSpanSizePt * 1.5) * lineHeightMult + 8
          );
          const effectivePdfBoxH = actualBoxHeightScreen * scaleY;
          const effectiveBl = screenToPdfPoint(tb.x * scaleX, (tb.y + actualBoxHeightScreen) * scaleY, m);

          // 1. Draw white background if requested (to cover old text or highlight box)
          if (tb.hasBackground) {
            page.drawRectangle({
              x: effectiveBl.x,
              y: effectiveBl.y,
              width: pdfBoxW,
              height: effectivePdfBoxH,
              color: pdfLib.rgb(1, 1, 1),
              borderWidth: tb.hasBorder ? 1 : 0,
              borderColor: tb.hasBorder ? textColor : undefined,
              rotate: pdfLib.degrees(rot),
            });
          } else if (tb.hasBorder) {
            page.drawRectangle({
              x: effectiveBl.x,
              y: effectiveBl.y,
              width: pdfBoxW,
              height: effectivePdfBoxH,
              borderWidth: 1,
              borderColor: textColor,
              rotate: pdfLib.degrees(rot),
            });
          }

          // 2. Draw text lines directly on page with per-span bold, italic, fontSize, and color
          if (spanLines.length > 0) {
            for (let lineIdx = 0; lineIdx < spanLines.length; lineIdx++) {
              const lineSpans = spanLines[lineIdx];
              if (!lineSpans || lineSpans.length === 0) continue;
              const lineScreenY = (tb.y + 4) * scaleY + (lineHeight - baseFontSizeToUse) * 0.5 + baseFontSizeToUse * 0.82 + lineIdx * lineHeight;

              let lineTotalW = 0;
              for (const seg of lineSpans) {
                const segFont = selectTbFont(seg.fontFamily || tb.fontFamily || 'Times New Roman', seg.isBold ?? tb.isBold, seg.isItalic ?? tb.isItalic);
                const segSize = ((seg.fontSize || tb.fontSize || 12) * 1.5) * ((scaleX + scaleY) / 2);
                let segW = seg.text.length * (segSize * 0.52);
                try {
                  segW = segFont.widthOfTextAtSize(seg.text, segSize);
                } catch (e) {}
                lineTotalW += segW;
              }

              let padXPt = 4 * scaleX;
              if (tb.textAlign === 'center') {
                padXPt = Math.max(4 * scaleX, (pdfBoxW - lineTotalW) / 2);
              } else if (tb.textAlign === 'right') {
                padXPt = Math.max(4 * scaleX, pdfBoxW - lineTotalW - 4 * scaleX);
              }

              let curScreenX = tb.x * scaleX + padXPt;
              for (const seg of lineSpans) {
                if (!seg.text) continue;
                const segFont = selectTbFont(seg.fontFamily || tb.fontFamily || 'Times New Roman', seg.isBold ?? tb.isBold, seg.isItalic ?? tb.isItalic);
                const segSize = ((seg.fontSize || tb.fontSize || 12) * 1.5) * ((scaleX + scaleY) / 2);
                const segColor = hexToRgb(seg.color || tb.color || '#000000');
                const pdfSegPt = screenToPdfPoint(curScreenX, lineScreenY, m);
                try {
                  page.drawText(seg.text, {
                    x: pdfSegPt.x,
                    y: pdfSegPt.y,
                    size: segSize,
                    font: segFont,
                    color: segColor,
                    rotate: pdfLib.degrees(rot),
                  });
                } catch (e) {
                  console.warn('Error drawing text span in PDF:', e);
                }
                let segW = seg.text.length * (segSize * 0.52);
                try {
                  segW = segFont.widthOfTextAtSize(seg.text, segSize);
                } catch (e) {}
                curScreenX += segW;
              }
            }
          }
        }
      }

      // 3. Save shapes (kẻ ô vuông & khoanh vùng) as non-destructive PDF Annotations (/Square & /Circle)
      // so they are not permanently baked into the background bitmap and can be edited/moved/deleted when reopened
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const { width, height } = page.getSize();
        
        let boxX = 0;
        let boxY = 0;
        let visibleWidth = width;
        let visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {}

        let angle = 0;
        try {
          const rotVal = page.getRotation();
          if (rotVal && typeof rotVal.angle === 'number') {
            angle = rotVal.angle;
          } else if (typeof rotVal === 'number') {
            angle = rotVal;
          }
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const parsedPage = pages[pIdx];
        if (!parsedPage) continue;
        const canvasWidth = parsedPage.width;
        const canvasHeight = parsedPage.height;

        const effectiveViewBox: [number, number, number, number] = parsedPage.viewBox || [
          boxX,
          boxY,
          boxX + visibleWidth,
          boxY + visibleHeight,
        ];
        const effectiveAngle = typeof parsedPage.pageRotation === 'number' ? parsedPage.pageRotation : angle;

        const { m, width: effW, height: effH } = getPageTransformMatrix(
          effectiveViewBox,
          effectiveAngle
        );
        const scaleX = effW / canvasWidth;
        const scaleY = effH / canvasHeight;

        // Clean out any previous /Square and /Circle annotations on this page so moved/deleted shapes are updated
        const curAnnots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (curAnnots && typeof (curAnnots as any).size === 'function') {
          const remaining: any[] = [];
          for (let aIdx = 0; aIdx < (curAnnots as any).size(); aIdx++) {
            const annotRef = (curAnnots as any).get(aIdx);
            const annot = (curAnnots as any).lookup(aIdx);
            const subtype = annot?.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Square' && subtype !== '/Circle') {
              remaining.push(annotRef);
            }
          }
          page.node.set(pdfLib.PDFName.of('Annots'), pdfDoc.context.obj(remaining));
        }

        const pageShapes = shapes.filter(s => s.pageIndex === pIdx);
        for (const sh of pageShapes) {
          const strokeRgb = hexToRgb(sh.strokeColor || '#ef4444');
          const shBorderWidth = Math.max(1, Math.round((sh.strokeWidth || 2) * ((scaleX + scaleY) / 2)));

          const tl = screenToPdfPoint(sh.x * scaleX, sh.y * scaleY, m);
          const tr = screenToPdfPoint((sh.x + sh.width) * scaleX, sh.y * scaleY, m);
          const blPt = screenToPdfPoint(sh.x * scaleX, (sh.y + sh.height) * scaleY, m);
          const brPt = screenToPdfPoint((sh.x + sh.width) * scaleX, (sh.y + sh.height) * scaleY, m);
          const minX = Math.min(tl.x, tr.x, blPt.x, brPt.x);
          const maxX = Math.max(tl.x, tr.x, blPt.x, brPt.x);
          const minY = Math.min(tl.y, tr.y, blPt.y, brPt.y);
          const maxY = Math.max(tl.y, tr.y, blPt.y, brPt.y);

          const annotConfig: any = {
            Type: 'Annot',
            Subtype: sh.type === 'circle' ? 'Circle' : 'Square',
            Rect: [minX, minY, maxX, maxY],
            C: [strokeRgb.red, strokeRgb.green, strokeRgb.blue],
            CA: 1.0,
            BS: pdfDoc.context.obj({
              Type: 'Border',
              W: shBorderWidth,
              S: sh.strokeStyle === 'dashed' ? 'D' : 'S',
              ...(sh.strokeStyle === 'dashed' ? { D: [6, 4] } : {}),
            }),
            Border: [0, 0, shBorderWidth],
            F: 4,
            CustomMeta: pdfLib.PDFString.of(encodeURIComponent(JSON.stringify(sh))),
          };

          if (sh.fillColor === 'white') {
            annotConfig.IC = [1, 1, 1];
          } else if (sh.fillColor === 'light') {
            annotConfig.IC = [
              strokeRgb.red * 0.15 + 0.85,
              strokeRgb.green * 0.15 + 0.85,
              strokeRgb.blue * 0.15 + 0.85,
            ];
          }

          const annotDict = pdfDoc.context.obj(annotConfig);
          const annotRef = pdfDoc.context.register(annotDict);
          let pageAnnotsArr = page.node.lookup(pdfLib.PDFName.of('Annots'));
          if (!pageAnnotsArr || typeof (pageAnnotsArr as any).push !== 'function') {
            const newAnnots = pdfDoc.context.obj([]);
            page.node.set(pdfLib.PDFName.of('Annots'), newAnnots);
            pageAnnotsArr = newAnnots;
          }
          (pageAnnotsArr as any).push(annotRef);
        }

        const pageImages = images.filter(img => img.pageIndex === pIdx);
        for (const img of pageImages) {
          try {
            const embeddedPng = await pdfDoc.embedPng(img.dataUrl);
            const { m: imgM, rot: imgRot } = getPageTransformMatrix(
              effectiveViewBox,
              effectiveAngle
            );
            const blImg = screenToPdfPoint(img.x * scaleX, (img.y + img.height) * scaleY, imgM);
            page.drawImage(embeddedPng, {
              x: blImg.x,
              y: blImg.y,
              width: img.width * scaleX,
              height: img.height * scaleY,
              rotate: pdfLib.degrees(imgRot),
            });
          } catch (imgErr) {
            console.warn('Error embedding image in PDF:', imgErr);
          }
        }
      }

      // Embed highlights and shapes metadata into PDF so they can be reopened and edited later
      try {
        pdfDoc.setSubject(JSON.stringify({ v: 3, highlights, shapes }));
      } catch (metaErr) {
        console.warn("Could not embed metadata:", metaErr);
      }
      
      const pdfBytes = await pdfDoc.save();
      setInitialFieldNames(fields.map(f => f.name));
      setFields(fields.map(f => ({ ...f, originalName: f.name })));

      const rawName = customFilename || documentName;
      const downloadName = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;

      try {
        localStorage.setItem(`pdf_highlights_${downloadName}`, JSON.stringify(highlights));
        localStorage.setItem(`pdf_highlights_${rawName}`, JSON.stringify(highlights));
        localStorage.setItem(`pdf_highlights_${documentName}`, JSON.stringify(highlights));
        localStorage.setItem(`pdf_shapes_${downloadName}`, JSON.stringify(shapes));
        localStorage.setItem(`pdf_shapes_${rawName}`, JSON.stringify(shapes));
        localStorage.setItem(`pdf_shapes_${documentName}`, JSON.stringify(shapes));
        localStorage.removeItem(`pdf_textboxes_${downloadName}`);
        localStorage.removeItem(`pdf_textboxes_${rawName}`);
        localStorage.removeItem(`pdf_textboxes_${documentName}`);
      } catch (e) {
        // ignore
      }

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      triggerSaveToast(`Đã lưu "${downloadName}"`, 'Đã tải tệp PDF đã cập nhật về máy.');
    } catch(err) {
      console.error(err);
      alert("Không thể xuất file PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectSave = async (forceSaveAs: boolean = false) => {
    if (!originalPdfBuffer) {
      alert("Vui lòng nhập tài liệu PDF trước khi lưu.");
      return;
    }

    setShowSaveDropdown(false);
    setIsProcessing(true);
    try {
      // 1. Acquire or verify FileSystemFileHandle BEFORE heavy PDF processing if Save As is requested or no handle exists yet
      let targetHandle = forceSaveAs ? null : fileHandleRef.current;
      const rawName = documentName || 'tai-lieu.pdf';
      const suggestedName = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;

      if (!targetHandle && typeof (window as any).showSaveFilePicker === 'function') {
        try {
          targetHandle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [
              {
                description: 'Tài liệu PDF (*.pdf)',
                accept: { 'application/pdf': ['.pdf'] },
              },
            ],
          });
          if (targetHandle) {
            fileHandleRef.current = targetHandle;
            setHasDirectFileHandle(true);
            if (targetHandle.name) {
              setDocumentName(targetHandle.name);
            }
          }
        } catch (pickerErr: any) {
          if (pickerErr && pickerErr.name === 'AbortError') {
            setIsProcessing(false);
            return;
          }
          // If SecurityError (e.g. inside cross-origin preview iframe), fallback to direct download below
          targetHandle = null;
        }
      } else if (targetHandle && typeof targetHandle.queryPermission === 'function') {
        try {
          const perm = await targetHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted' && typeof targetHandle.requestPermission === 'function') {
            const reqPerm = await targetHandle.requestPermission({ mode: 'readwrite' });
            if (reqPerm !== 'granted') {
              setIsProcessing(false);
              return;
            }
          }
        } catch (permErr: any) {
          if (permErr && permErr.name === 'AbortError') {
            setIsProcessing(false);
            return;
          }
        }
      }

      // 2. Build the updated PDF bytes using the exact same pipeline as exportToPDF
      const loadedFonts = await ensureFontsLoaded();
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      pdfDoc.registerFontkit(fontkit);

      const safeSerifRegular = loadedFonts?.serifRegular || fontsRef.current.serifRegular || fontSerifRegular || vietnameseFontBytes || fontSansRegular;
      const safeSerifBold = loadedFonts?.serifBold || fontsRef.current.serifBold || fontSerifBold || safeSerifRegular;
      const safeSerifItalic = loadedFonts?.serifItalic || fontsRef.current.serifItalic || fontSerifItalic || safeSerifRegular;
      const safeSerifBoldItalic = loadedFonts?.serifBoldItalic || fontsRef.current.serifBoldItalic || fontSerifBoldItalic || safeSerifItalic || safeSerifBold;

      const safeSansRegular = loadedFonts?.sansRegular || fontsRef.current.sansRegular || fontSansRegular || vietnameseFontBytes || fontSerifRegular;
      const safeSansBold = loadedFonts?.sansBold || fontsRef.current.sansBold || fontSansBold || safeSansRegular;
      const safeSansItalic = loadedFonts?.sansItalic || fontsRef.current.sansItalic || fontSansItalic || safeSansRegular;
      const safeSansBoldItalic = loadedFonts?.sansBoldItalic || fontsRef.current.sansBoldItalic || fontSansBoldItalic || safeSansItalic || safeSansBold;

      const embeddedSerifRegular = safeSerifRegular ? await pdfDoc.embedFont(safeSerifRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRoman);
      const embeddedSerifBold = safeSerifBold ? await pdfDoc.embedFont(safeSerifBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanBold);
      const embeddedSerifItalic = safeSerifItalic ? await pdfDoc.embedFont(safeSerifItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanItalic);
      const embeddedSerifBoldItalic = safeSerifBoldItalic ? await pdfDoc.embedFont(safeSerifBoldItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanBoldItalic);

      const embeddedSansRegular = safeSansRegular ? await pdfDoc.embedFont(safeSansRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
      const embeddedSansBold = safeSansBold ? await pdfDoc.embedFont(safeSansBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const embeddedSansItalic = safeSansItalic ? await pdfDoc.embedFont(safeSansItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaOblique);
      const embeddedSansBoldItalic = safeSansBoldItalic ? await pdfDoc.embedFont(safeSansBoldItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBoldOblique);

      const hexToRgb = (hex: string) => {
        const cleanHex = (hex || '#000000').replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
        const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
        const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
        return pdfLib.rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b);
      };

      const form = pdfDoc.getForm();
      const pdfPages = pdfDoc.getPages();

      const modifiedTexts = pdfTexts.filter(t => t.isModified);
      for (const t of modifiedTexts) {
        if (t.pageIndex < pdfPages.length) {
          const page = pdfPages[t.pageIndex];
          const pdfOffsetX = (t.offsetX || 0) / 1.5;
          const pdfOffsetY = -(t.offsetY || 0) / 1.5;
          const finalPdfX = t.pdfX + pdfOffsetX;
          const finalPdfY = t.pdfY + pdfOffsetY;
          const fontSizeToUse = t.customFontSize || t.pdfHeight;
          const selectFontForProps = (fam: string, bold?: boolean, italic?: boolean) => {
            const cleanFam = getCleanFontDisplayName(fam);
            const sans = cleanFam === 'Arial' || cleanFam === 'Roboto';
            if (sans) {
              if (bold && italic) return embeddedSansBoldItalic;
              if (italic) return embeddedSansItalic;
              if (bold) return embeddedSansBold;
              return embeddedSansRegular;
            }
            if (bold && italic) return embeddedSerifBoldItalic;
            if (italic) return embeddedSerifItalic;
            if (bold) return embeddedSerifBold;
            return embeddedSerifRegular;
          };

          const activeSpans = getNormalizedSpans(t);
          const maxSpanFontSize = Math.max(fontSizeToUse, ...activeSpans.map(s => s.fontSize || fontSizeToUse));

          if (t.hasBackground !== false) {
            const origBoxH = Math.max(t.pdfHeight, maxSpanFontSize);
            page.drawRectangle({
              x: t.pdfX - 1.5,
              y: t.pdfY - origBoxH * 0.26,
              width: t.pdfWidth * 1.04 + 3,
              height: origBoxH * 1.34,
              color: pdfLib.rgb(1, 1, 1),
              rotate: pdfLib.degrees(t.rotation || 0),
            });

            let newTextWidthInPdf = 0;
            try {
              for (const seg of activeSpans) {
                const segFont = selectFontForProps(seg.fontFamily || t.customFontFamily || t.fontName || '', seg.isBold ?? t.isBold, seg.isItalic ?? t.isItalic);
                const segSize = seg.fontSize || fontSizeToUse;
                newTextWidthInPdf += segFont.widthOfTextAtSize(seg.text, segSize);
              }
            } catch (e) {}
            if (newTextWidthInPdf > 0) {
              page.drawRectangle({
                x: finalPdfX - 1,
                y: finalPdfY - maxSpanFontSize * 0.25,
                width: newTextWidthInPdf + 2,
                height: maxSpanFontSize * 1.32,
                color: pdfLib.rgb(1, 1, 1),
                rotate: pdfLib.degrees(t.rotation || 0),
              });
            }
          }

          if (t.text) {
            const rad = ((t.rotation || 0) * Math.PI) / 180;
            let curX = finalPdfX;
            let curY = finalPdfY;
            for (const seg of activeSpans) {
              if (!seg.text) continue;
              const segFont = selectFontForProps(seg.fontFamily || t.customFontFamily || t.fontName || '', seg.isBold ?? t.isBold, seg.isItalic ?? t.isItalic);
              const segSize = seg.fontSize || fontSizeToUse;
              const segColor = hexToRgb(seg.color || t.customColor || '#000000');
              try {
                page.drawText(seg.text, {
                  x: curX,
                  y: curY,
                  size: segSize,
                  font: segFont,
                  color: segColor,
                  rotate: pdfLib.degrees(t.rotation || 0),
                });
              } catch (e) {}
              let segW = seg.text.length * (segSize * 0.5);
              try {
                segW = segFont.widthOfTextAtSize(seg.text, segSize);
              } catch (e) {}
              curX += segW * Math.cos(rad);
              curY += segW * Math.sin(rad);
            }
          }
        }
      }

      const namesToRemove = new Set<string>(initialFieldNames);
      fields.forEach(f => {
        if (f.originalName) namesToRemove.add(f.originalName);
        namesToRemove.add(f.name);
        namesToRemove.add(f.id);
      });
      namesToRemove.forEach(fieldName => safeRemoveField(pdfDoc, fieldName));

      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.pageIndex < pdfPages.length) {
          const page = pdfPages[f.pageIndex];
          const { width, height } = page.getSize();
          let angle = 0;
          try {
            const rot = page.getRotation();
            if (rot && typeof rot.angle === 'number') angle = rot.angle;
            else if (typeof rot === 'number') angle = rot;
          } catch (e) {}
          angle = (angle % 360 + 360) % 360;

          let visibleWidth = width, visibleHeight = height, boxX = 0, boxY = 0;
          try {
            const cropBox = page.getCropBox();
            if (cropBox) {
              boxX = cropBox.x || 0;
              boxY = cropBox.y || 0;
              visibleWidth = cropBox.width;
              visibleHeight = cropBox.height;
            }
          } catch (e) {}

          const parsedPage = pages[f.pageIndex];
          const canvasWidth = parsedPage.width;
          const canvasHeight = parsedPage.height;
          let fieldX = 0, fieldY = 0, fieldWidth = 0, fieldHeight = 0;

          if (angle === 90) {
            const scaleX = visibleHeight / canvasWidth;
            const scaleY = visibleWidth / canvasHeight;
            fieldX = boxX + (f.y * scaleY);
            fieldY = boxY + (f.x * scaleX);
            fieldWidth = f.height * scaleY;
            fieldHeight = f.width * scaleX;
          } else if (angle === 180) {
            const scaleX = visibleWidth / canvasWidth;
            const scaleY = visibleHeight / canvasHeight;
            fieldX = boxX + (visibleWidth - (f.x + f.width) * scaleX);
            fieldY = boxY + (f.y * scaleY);
            fieldWidth = f.width * scaleX;
            fieldHeight = f.height * scaleY;
          } else if (angle === 270) {
            const scaleX = visibleHeight / canvasWidth;
            const scaleY = visibleWidth / canvasHeight;
            fieldX = boxX + (visibleWidth - (f.y + f.height) * scaleY);
            fieldY = boxY + (visibleHeight - (f.x + f.width) * scaleX);
            fieldWidth = f.height * scaleY;
            fieldHeight = f.width * scaleX;
          } else {
            const scaleX = visibleWidth / canvasWidth;
            const scaleY = visibleHeight / canvasHeight;
            fieldX = boxX + (f.x * scaleX);
            fieldY = boxY + (visibleHeight - (f.y + f.height) * scaleY);
            fieldWidth = f.width * scaleX;
            fieldHeight = f.height * scaleY;
          }

          if (f.type === 'signature') {
            const signatureFields: any = {
              Type: 'Annot',
              Subtype: 'Widget',
              FT: 'Sig',
              Rect: [fieldX, fieldY, fieldX + fieldWidth, fieldY + fieldHeight],
              T: pdfLib.PDFString.of(f.name),
              F: 4,
              P: page.ref,
            };
            if (angle !== 0) {
              signatureFields.MK = pdfDoc.context.obj({ R: angle });
            }
            const signatureDict = pdfDoc.context.obj(signatureFields);
            const signatureRef = pdfDoc.context.register(signatureDict);
            page.node.addAnnot(signatureRef);
            form.acroForm.addField(signatureRef);
          } else if (f.type === 'text') {
            try {
              const textField = form.createTextField(f.id);
              textField.setText(f.textValue || '');
              textField.addToPage(page, { x: fieldX, y: fieldY, width: fieldWidth, height: fieldHeight });
              if (f.fontSize) textField.setFontSize(f.fontSize);
            } catch (e) {}
          }
        }
      }

      // Highlights & Whiteouts
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const { width, height } = page.getSize();
        let boxX = 0, boxY = 0, visibleWidth = width, visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {}
        let angle = 0;
        try {
          const rotVal = page.getRotation();
          if (rotVal && typeof rotVal.angle === 'number') angle = rotVal.angle;
          else if (typeof rotVal === 'number') angle = rotVal;
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const parsedPage = pages[pIdx];
        if (!parsedPage) continue;
        const canvasWidth = parsedPage.width;
        const canvasHeight = parsedPage.height;

        const effectiveViewBox: [number, number, number, number] = parsedPage.viewBox || [
          boxX,
          boxY,
          boxX + visibleWidth,
          boxY + visibleHeight,
        ];
        const effectiveAngle = typeof parsedPage.pageRotation === 'number' ? parsedPage.pageRotation : angle;

        const { m, width: effW, height: effH, rot } = getPageTransformMatrix(
          effectiveViewBox,
          effectiveAngle
        );
        const scaleX = effW / canvasWidth;
        const scaleY = effH / canvasHeight;

        const curAnnots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (curAnnots && typeof (curAnnots as any).size === 'function') {
          const remaining: any[] = [];
          for (let aIdx = 0; aIdx < (curAnnots as any).size(); aIdx++) {
            const annotRef = (curAnnots as any).get(aIdx);
            const annot = (curAnnots as any).lookup(aIdx);
            const subtype = annot?.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Highlight') remaining.push(annotRef);
          }
          page.node.set(pdfLib.PDFName.of('Annots'), pdfDoc.context.obj(remaining));
        }

        const pageHighlights = highlights.filter(h => h.pageIndex === pIdx);
        for (const h of pageHighlights) {
          const bl = screenToPdfPoint(h.x * scaleX, (h.y + h.height) * scaleY, m);
          const pdfHlW = h.width * scaleX;
          const pdfHlH = h.height * scaleY;

          if (h.isWhiteout) {
            page.drawRectangle({
              x: bl.x,
              y: bl.y,
              width: pdfHlW,
              height: pdfHlH,
              color: pdfLib.rgb(1, 1, 1),
              rotate: pdfLib.degrees(rot),
            });
          } else {
            const rgb = hexToRgb(h.color || '#fde047');
            const tl = screenToPdfPoint(h.x * scaleX, h.y * scaleY, m);
            const tr = screenToPdfPoint((h.x + h.width) * scaleX, h.y * scaleY, m);
            const blPt = screenToPdfPoint(h.x * scaleX, (h.y + h.height) * scaleY, m);
            const brPt = screenToPdfPoint((h.x + h.width) * scaleX, (h.y + h.height) * scaleY, m);
            const minX = Math.min(tl.x, tr.x, blPt.x, brPt.x);
            const maxX = Math.max(tl.x, tr.x, blPt.x, brPt.x);
            const minY = Math.min(tl.y, tr.y, blPt.y, brPt.y);
            const maxY = Math.max(tl.y, tr.y, blPt.y, brPt.y);

            const annotDict = pdfDoc.context.obj({
              Type: 'Annot',
              Subtype: 'Highlight',
              Rect: [minX, minY, maxX, maxY],
              C: [rgb.red, rgb.green, rgb.blue],
              CA: h.opacity || 0.45,
              QuadPoints: [
                tl.x, tl.y,
                tr.x, tr.y,
                blPt.x, blPt.y,
                brPt.x, brPt.y,
              ],
              F: 4,
            });
            const annotRef = pdfDoc.context.register(annotDict);
            let currentAnnots = page.node.lookup(pdfLib.PDFName.of('Annots'));
            if (!currentAnnots || typeof (currentAnnots as any).push !== 'function') {
              const newAnnots = pdfDoc.context.obj([]);
              page.node.set(pdfLib.PDFName.of('Annots'), newAnnots);
              currentAnnots = newAnnots;
            }
            (currentAnnots as any).push(annotRef);
          }
        }
      }

      // TextBoxes
      const allTextBoxesToProcess = [
        ...deletedTextBoxes.map(dtb => ({ ...dtb, _isDeleted: true })),
        ...textBoxes.map(tb => ({ ...tb, _isDeleted: false }))
      ];
      for (const tb of allTextBoxesToProcess) {
        if (!tb._isDeleted && !tb.text.trim() && !tb.hasBackground && !tb.hasBorder) continue;
        if (tb.pageIndex < pdfPages.length) {
          const page = pdfPages[tb.pageIndex];
          const { width, height } = page.getSize();
          let boxX = 0, boxY = 0, visibleWidth = width, visibleHeight = height;
          try {
            const cropBox = page.getCropBox();
            if (cropBox) {
              boxX = cropBox.x || 0;
              boxY = cropBox.y || 0;
              visibleWidth = cropBox.width;
              visibleHeight = cropBox.height;
            }
          } catch (e) {}

          let angle = 0;
          try {
            const rotVal = page.getRotation();
            if (rotVal && typeof rotVal.angle === 'number') angle = rotVal.angle;
            else if (typeof rotVal === 'number') angle = rotVal;
          } catch (e) {}
          angle = (angle % 360 + 360) % 360;

          const parsedPage = pages[tb.pageIndex];
          if (!parsedPage) continue;
          const canvasWidth = parsedPage.width;
          const canvasHeight = parsedPage.height;

          const effectiveViewBox: [number, number, number, number] = parsedPage.viewBox || [
            boxX,
            boxY,
            boxX + visibleWidth,
            boxY + visibleHeight,
          ];
          const effectiveAngle = typeof parsedPage.pageRotation === 'number' ? parsedPage.pageRotation : angle;

          const { m, width: effW, height: effH, rot } = getPageTransformMatrix(
            effectiveViewBox,
            effectiveAngle
          );
          const scaleX = effW / canvasWidth;
          const scaleY = effH / canvasHeight;
          const pdfBoxW = tb.width * scaleX;
          const pdfBoxH = tb.height * scaleY;

          const selectTbFont = (ffName: string, bold?: boolean, italic?: boolean) => {
            const cleanFam = getCleanFontDisplayName(ffName);
            const isSans = cleanFam === 'Arial' || cleanFam === 'Roboto';
            if (isSans) {
              if (bold && italic) return embeddedSansBoldItalic;
              if (italic) return embeddedSansItalic;
              if (bold) return embeddedSansBold;
              return embeddedSansRegular;
            }
            if (bold && italic) return embeddedSerifBoldItalic;
            if (italic) return embeddedSerifItalic;
            if (bold) return embeddedSerifBold;
            return embeddedSerifRegular;
          };

          const spanLines = (!tb._isDeleted && tb.text.trim()) ? wrapTextBoxSpansToLines(tb) : [];
          const activeTbSpans = getNormalizedTextBoxSpans(tb);
          const maxSpanSizePt = Math.max(
            tb.fontSize || 12,
            ...activeTbSpans.map(s => s.fontSize || tb.fontSize || 12)
          );
          const lineHeightMult = tb.lineHeight || 1.25;
          const actualBoxHeightScreen = Math.max(
            tb.height,
            spanLines.length * (maxSpanSizePt * 1.5) * lineHeightMult + 8
          );
          const effectivePdfBoxH = actualBoxHeightScreen * scaleY;

          if (tb._isDeleted || tb.hasBackground || tb.hasBorder) {
            const bl = screenToPdfPoint(tb.x * scaleX, (tb.y + actualBoxHeightScreen) * scaleY, m);
            page.drawRectangle({
              x: bl.x,
              y: bl.y,
              width: pdfBoxW,
              height: effectivePdfBoxH,
              color: (tb._isDeleted || tb.hasBackground) ? pdfLib.rgb(1, 1, 1) : undefined,
              borderColor: (!tb._isDeleted && tb.hasBorder) ? hexToRgb(tb.color || '#000000') : undefined,
              borderWidth: (!tb._isDeleted && tb.hasBorder) ? 1 : 0,
              rotate: pdfLib.degrees(rot),
            });
          }

          if (!tb._isDeleted && spanLines.length > 0) {
            const baseFontSizeToUse = (maxSpanSizePt * 1.5) * ((scaleX + scaleY) / 2);
            const lineHeight = baseFontSizeToUse * lineHeightMult;

            for (let lIdx = 0; lIdx < spanLines.length; lIdx++) {
              const lineSpans = spanLines[lIdx];
              if (!lineSpans || lineSpans.length === 0) continue;
              const lineScreenY = (tb.y + 4) * scaleY + (lineHeight - baseFontSizeToUse) * 0.5 + baseFontSizeToUse * 0.82 + lIdx * lineHeight;

              let lineTotalW = 0;
              for (const seg of lineSpans) {
                const segFont = selectTbFont(seg.fontFamily || tb.fontFamily || 'Times New Roman', seg.isBold ?? tb.isBold, seg.isItalic ?? tb.isItalic);
                const segSize = ((seg.fontSize || tb.fontSize || 12) * 1.5) * ((scaleX + scaleY) / 2);
                let segW = seg.text.length * (segSize * 0.52);
                try {
                  segW = segFont.widthOfTextAtSize(seg.text, segSize);
                } catch (e) {}
                lineTotalW += segW;
              }

              let padXPt = 4 * scaleX;
              if (tb.textAlign === 'center') padXPt = Math.max(4 * scaleX, (pdfBoxW - lineTotalW) / 2);
              else if (tb.textAlign === 'right') padXPt = Math.max(4 * scaleX, pdfBoxW - lineTotalW - 4 * scaleX);

              let curScreenX = tb.x * scaleX + padXPt;
              for (const seg of lineSpans) {
                if (!seg.text) continue;
                const segFont = selectTbFont(seg.fontFamily || tb.fontFamily || 'Times New Roman', seg.isBold ?? tb.isBold, seg.isItalic ?? tb.isItalic);
                const segSize = ((seg.fontSize || tb.fontSize || 12) * 1.5) * ((scaleX + scaleY) / 2);
                const segColor = hexToRgb(seg.color || tb.color || '#000000');
                const pdfSegPt = screenToPdfPoint(curScreenX, lineScreenY, m);
                try {
                  page.drawText(seg.text, {
                    x: pdfSegPt.x,
                    y: pdfSegPt.y,
                    size: segSize,
                    font: segFont,
                    color: segColor,
                    rotate: pdfLib.degrees(rot),
                  });
                } catch (e) {
                  console.warn('Error drawing TextBox span on direct save:', e);
                }
                let segW = seg.text.length * (segSize * 0.52);
                try {
                  segW = segFont.widthOfTextAtSize(seg.text, segSize);
                } catch (e) {}
                curScreenX += segW;
              }
            }
          }
        }
      }

      // Shapes
      for (let pIdx = 0; pIdx < pdfPages.length; pIdx++) {
        const page = pdfPages[pIdx];
        const { width, height } = page.getSize();
        let boxX = 0, boxY = 0, visibleWidth = width, visibleHeight = height;
        try {
          const cropBox = page.getCropBox();
          if (cropBox) {
            boxX = cropBox.x || 0;
            boxY = cropBox.y || 0;
            visibleWidth = cropBox.width;
            visibleHeight = cropBox.height;
          }
        } catch (e) {}
        let angle = 0;
        try {
          const rotVal = page.getRotation();
          if (rotVal && typeof rotVal.angle === 'number') angle = rotVal.angle;
          else if (typeof rotVal === 'number') angle = rotVal;
        } catch (e) {}
        angle = (angle % 360 + 360) % 360;

        const parsedPage = pages[pIdx];
        if (!parsedPage) continue;
        const canvasWidth = parsedPage.width;
        const canvasHeight = parsedPage.height;

        const effectiveViewBox: [number, number, number, number] = parsedPage.viewBox || [
          boxX,
          boxY,
          boxX + visibleWidth,
          boxY + visibleHeight,
        ];
        const effectiveAngle = typeof parsedPage.pageRotation === 'number' ? parsedPage.pageRotation : angle;

        const { m, width: effW, height: effH } = getPageTransformMatrix(
          effectiveViewBox,
          effectiveAngle
        );
        const scaleX = effW / canvasWidth;
        const scaleY = effH / canvasHeight;

        const curAnnots = page.node.lookup(pdfLib.PDFName.of('Annots'));
        if (curAnnots && typeof (curAnnots as any).size === 'function') {
          const remaining: any[] = [];
          for (let aIdx = 0; aIdx < (curAnnots as any).size(); aIdx++) {
            const annotRef = (curAnnots as any).get(aIdx);
            const annot = (curAnnots as any).lookup(aIdx);
            const subtype = annot?.lookup(pdfLib.PDFName.of('Subtype'))?.toString();
            if (subtype !== '/Square' && subtype !== '/Circle') remaining.push(annotRef);
          }
          page.node.set(pdfLib.PDFName.of('Annots'), pdfDoc.context.obj(remaining));
        }

        const pageShapes = shapes.filter(s => s.pageIndex === pIdx);
        for (const sh of pageShapes) {
          const strokeRgb = hexToRgb(sh.strokeColor || '#ef4444');
          const shBorderWidth = Math.max(1, Math.round((sh.strokeWidth || 2) * ((scaleX + scaleY) / 2)));
          const tl = screenToPdfPoint(sh.x * scaleX, sh.y * scaleY, m);
          const tr = screenToPdfPoint((sh.x + sh.width) * scaleX, sh.y * scaleY, m);
          const blPt = screenToPdfPoint(sh.x * scaleX, (sh.y + sh.height) * scaleY, m);
          const brPt = screenToPdfPoint((sh.x + sh.width) * scaleX, (sh.y + sh.height) * scaleY, m);
          const minX = Math.min(tl.x, tr.x, blPt.x, brPt.x);
          const maxX = Math.max(tl.x, tr.x, blPt.x, brPt.x);
          const minY = Math.min(tl.y, tr.y, blPt.y, brPt.y);
          const maxY = Math.max(tl.y, tr.y, blPt.y, brPt.y);

          const annotConfig: any = {
            Type: 'Annot',
            Subtype: sh.type === 'circle' ? 'Circle' : 'Square',
            Rect: [minX, minY, maxX, maxY],
            C: [strokeRgb.red, strokeRgb.green, strokeRgb.blue],
            CA: 1.0,
            BS: pdfDoc.context.obj({
              Type: 'Border',
              W: shBorderWidth,
              S: sh.strokeStyle === 'dashed' ? 'D' : 'S',
              ...(sh.strokeStyle === 'dashed' ? { D: [6, 4] } : {}),
            }),
            Border: [0, 0, shBorderWidth],
            F: 4,
            CustomMeta: pdfLib.PDFString.of(encodeURIComponent(JSON.stringify(sh))),
          };

          if (sh.fillColor === 'white') {
            annotConfig.IC = [1, 1, 1];
          } else if (sh.fillColor === 'light') {
            annotConfig.IC = [
              strokeRgb.red * 0.15 + 0.85,
              strokeRgb.green * 0.15 + 0.85,
              strokeRgb.blue * 0.15 + 0.85,
            ];
          }

          const annotDict = pdfDoc.context.obj(annotConfig);
          const annotRef = pdfDoc.context.register(annotDict);
          let pageAnnotsArr = page.node.lookup(pdfLib.PDFName.of('Annots'));
          if (!pageAnnotsArr || typeof (pageAnnotsArr as any).push !== 'function') {
            const newAnnots = pdfDoc.context.obj([]);
            page.node.set(pdfLib.PDFName.of('Annots'), newAnnots);
            pageAnnotsArr = newAnnots;
          }
          (pageAnnotsArr as any).push(annotRef);
        }

        const pageImages = images.filter(img => img.pageIndex === pIdx);
        for (const img of pageImages) {
          try {
            const embeddedPng = await pdfDoc.embedPng(img.dataUrl);
            const { m: imgM, rot: imgRot } = getPageTransformMatrix(
              effectiveViewBox,
              effectiveAngle
            );
            const blImg = screenToPdfPoint(img.x * scaleX, (img.y + img.height) * scaleY, imgM);
            page.drawImage(embeddedPng, {
              x: blImg.x,
              y: blImg.y,
              width: img.width * scaleX,
              height: img.height * scaleY,
              rotate: pdfLib.degrees(imgRot),
            });
          } catch (imgErr) {
            console.warn('Error embedding image in PDF:', imgErr);
          }
        }
      }

      try {
        pdfDoc.setSubject(JSON.stringify({ v: 3, highlights, shapes }));
      } catch (metaErr) {}

      const pdfBytes = await pdfDoc.save();
      setInitialFieldNames(fields.map(f => f.name));
      setFields(fields.map(f => ({ ...f, originalName: f.name })));

      const savedFileName = targetHandle?.name || suggestedName;
      try {
        localStorage.setItem(`pdf_highlights_${savedFileName}`, JSON.stringify(highlights));
        localStorage.setItem(`pdf_highlights_${documentName}`, JSON.stringify(highlights));
        localStorage.setItem(`pdf_shapes_${savedFileName}`, JSON.stringify(shapes));
        localStorage.setItem(`pdf_shapes_${documentName}`, JSON.stringify(shapes));
        localStorage.removeItem(`pdf_textboxes_${savedFileName}`);
        localStorage.removeItem(`pdf_textboxes_${documentName}`);
      } catch (e) {}

      setEditingTextId(null);
      setEditingTextBoxId(null);

      // 3. Write directly to the FileSystemFileHandle on disk if available
      if (targetHandle && typeof targetHandle.createWritable === 'function') {
        try {
          const writable = await targetHandle.createWritable();
          await writable.write(pdfBytes);
          await writable.close();
          triggerSaveToast(`Đã lưu "${savedFileName}"`, 'Đã cập nhật trực tiếp lên tệp gốc trên máy.');
          return;
        } catch (writeErr: any) {
          if (writeErr && writeErr.name === 'AbortError') {
            return; // User clicked Cancel on browser "Save changes to ...pdf?" prompt
          }
          console.warn('Direct file write failed:', writeErr);
        }
      }

      // 4. Nếu đang ở trong khung xem trước (iframe) nên trình duyệt chặn hộp chọn file gốc:
      // Không tự ý tải xuống bản sao "(1).pdf" mà hiển thị hộp thoại kết nối trực tiếp tệp gốc hoặc mở Tab riêng
      if (!forceSaveAs) {
        setPendingDirectSaveBytes({ bytes: pdfBytes, filename: savedFileName });
        triggerSaveToast(`Đã áp dụng thay đổi lên "${savedFileName}"`, 'Chọn tệp gốc hoặc mở Tab riêng để ghi đè lên ổ đĩa.');
        return;
      }

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = savedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerSaveToast(`Đã lưu "${savedFileName}"`, 'Đã tải tệp PDF cập nhật về máy.');
    } catch (err) {
      console.error(err);
      alert("Không thể lưu file PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderFormattingSidebar = () => null;

  return (
    <div 
      className="flex flex-col h-screen overflow-hidden bg-gray-100 font-sans select-none text-gray-800"
      onMouseMove={(e) => {
        if (fieldInteraction) {
          const pageElement = document.getElementById(`page-${fieldInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = (e.clientX - rect.left) / zoom;
          let y = (e.clientY - rect.top) / zoom;
          
          const dx = x - fieldInteraction.startX;
          const dy = y - fieldInteraction.startY;

          const targetPage = pages[fieldInteraction.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;
          
          setFields(fields.map(f => {
            if (f.id !== fieldInteraction.id) return f;
            
            let newX = fieldInteraction.originalX;
            let newY = fieldInteraction.originalY;
            let newW = fieldInteraction.originalWidth;
            let newH = fieldInteraction.originalHeight;
            
            if (fieldInteraction.type === 'drag') {
              newX += dx;
              newY += dy;
            } else {
              if (fieldInteraction.type.includes('e')) newW += dx;
              if (fieldInteraction.type.includes('s')) newH += dy;
              if (fieldInteraction.type.includes('w')) {
                newX += dx;
                newW -= dx;
              }
              if (fieldInteraction.type.includes('n')) {
                newY += dy;
                newH -= dy;
              }
              
              if (newW < 20) {
                  if (fieldInteraction.type.includes('w')) newX -= (20 - newW);
                  newW = 20;
              }
              if (newH < 20) {
                  if (fieldInteraction.type.includes('n')) newY -= (20 - newH);
                  newH = 20;
              }
            }
            
            newX = Math.max(0, Math.min(pageWidth - newW, newX));
            newY = Math.max(0, Math.min(pageHeight - newH, newY));
            
            return { ...f, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (highlightInteraction) {
          const pageElement = document.getElementById(`page-${highlightInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = (e.clientX - rect.left) / zoom;
          let y = (e.clientY - rect.top) / zoom;
          
          const dx = x - highlightInteraction.startX;
          const dy = y - highlightInteraction.startY;

          const targetPage = pages[highlightInteraction.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;
          
          setHighlights(prev => prev.map(h => {
            if (h.id !== highlightInteraction.id) return h;
            
            let newX = highlightInteraction.originalX;
            let newY = highlightInteraction.originalY;
            let newW = highlightInteraction.originalWidth;
            let newH = highlightInteraction.originalHeight;
            
            if (highlightInteraction.type === 'drag') {
              newX += dx;
              newY += dy;
            } else if (highlightInteraction.type === 'e') {
              newW += dx;
              if (newW < 10) newW = 10;
            } else if (highlightInteraction.type === 's') {
              newH += dy;
              if (newH < 10) newH = 10;
            } else if (highlightInteraction.type === 'se') {
              newW += dx;
              newH += dy;
              if (newW < 10) newW = 10;
              if (newH < 10) newH = 10;
            }
            
            newX = Math.max(0, Math.min(pageWidth - newW, newX));
            newY = Math.max(0, Math.min(pageHeight - newH, newY));
            
            return { ...h, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (textBoxInteraction) {
          const pageElement = document.getElementById(`page-${textBoxInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = (e.clientX - rect.left) / zoom;
          let y = (e.clientY - rect.top) / zoom;
          
          const dx = x - textBoxInteraction.startX;
          const dy = y - textBoxInteraction.startY;

          const targetPage = pages[textBoxInteraction.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;
          
          setTextBoxes(prev => prev.map(tb => {
            if (tb.id !== textBoxInteraction.id) return tb;
            
            let newX = textBoxInteraction.originalX;
            let newY = textBoxInteraction.originalY;
            let newW = textBoxInteraction.originalWidth;
            let newH = textBoxInteraction.originalHeight;
            
            if (textBoxInteraction.type === 'drag') {
              newX += dx;
              newY += dy;
            } else {
              if (textBoxInteraction.type.includes('e')) newW += dx;
              if (textBoxInteraction.type.includes('s')) newH += dy;
              if (textBoxInteraction.type.includes('w')) {
                newX += dx;
                newW -= dx;
              }
              if (textBoxInteraction.type.includes('n')) {
                newY += dy;
                newH -= dy;
              }
              
              if (newW < 30) {
                if (textBoxInteraction.type.includes('w')) newX -= (30 - newW);
                newW = 30;
              }
              if (newH < 20) {
                if (textBoxInteraction.type.includes('n')) newY -= (20 - newH);
                newH = 20;
              }
            }
            
            newX = Math.max(0, Math.min(pageWidth - newW, newX));
            newY = Math.max(0, Math.min(pageHeight - newH, newY));
            
            return { ...tb, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (shapeInteraction) {
          const pageElement = document.getElementById(`page-${shapeInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = (e.clientX - rect.left) / zoom;
          let y = (e.clientY - rect.top) / zoom;
          
          const dx = x - shapeInteraction.startX;
          const dy = y - shapeInteraction.startY;

          const targetPage = pages[shapeInteraction.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;
          
          setShapes(prev => prev.map(sh => {
            if (sh.id !== shapeInteraction.id) return sh;
            
            let newX = shapeInteraction.originalX;
            let newY = shapeInteraction.originalY;
            let newW = shapeInteraction.originalWidth;
            let newH = shapeInteraction.originalHeight;
            
            if (shapeInteraction.type === 'drag') {
              newX += dx;
              newY += dy;
            } else {
              if (shapeInteraction.type.includes('e')) newW += dx;
              if (shapeInteraction.type.includes('s')) newH += dy;
              if (shapeInteraction.type.includes('w')) {
                newX += dx;
                newW -= dx;
              }
              if (shapeInteraction.type.includes('n')) {
                newY += dy;
                newH -= dy;
              }
              
              if (newW < 15) {
                if (shapeInteraction.type.includes('w')) newX -= (15 - newW);
                newW = 15;
              }
              if (newH < 15) {
                if (shapeInteraction.type.includes('n')) newY -= (15 - newH);
                newH = 15;
              }
            }
            
            newX = Math.max(0, Math.min(pageWidth - newW, newX));
            newY = Math.max(0, Math.min(pageHeight - newH, newY));
            
            return { ...sh, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (imageInteraction) {
          const pageElement = document.getElementById(`page-${imageInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          const x = (e.clientX - rect.left) / zoom;
          const y = (e.clientY - rect.top) / zoom;

          const dx = x - imageInteraction.startX;
          const dy = y - imageInteraction.startY;

          const targetPage = pages[imageInteraction.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;

          setImages(prev => prev.map(img => {
            if (img.id !== imageInteraction.id) return img;

            let newX = imageInteraction.originalX;
            let newY = imageInteraction.originalY;
            let newW = imageInteraction.originalWidth;
            let newH = imageInteraction.originalHeight;
            const aspect = imageInteraction.aspectRatio || (imageInteraction.originalWidth / Math.max(1, imageInteraction.originalHeight));

            if (imageInteraction.type === 'drag') {
              newX += dx;
              newY += dy;
            } else if (
              imageInteraction.type === 'nw' ||
              imageInteraction.type === 'ne' ||
              imageInteraction.type === 'se' ||
              imageInteraction.type === 'sw'
            ) {
              // 4 góc: Phóng to / thu nhỏ đồng tỷ lệ (to/nhỏ)
              const deltaW = imageInteraction.type.includes('e') ? dx : -dx;
              newW = Math.max(24, Math.round(imageInteraction.originalWidth + deltaW));
              newH = Math.max(24, Math.round(newW / aspect));
              if (imageInteraction.type.includes('w')) {
                newX = imageInteraction.originalX + (imageInteraction.originalWidth - newW);
              }
              if (imageInteraction.type.includes('n')) {
                newY = imageInteraction.originalY + (imageInteraction.originalHeight - newH);
              }
            } else {
              // 4 cạnh: Chỉnh kích thước dài / rộng độc lập
              if (imageInteraction.type === 'e') {
                newW = Math.max(20, Math.round(imageInteraction.originalWidth + dx));
              } else if (imageInteraction.type === 'w') {
                newW = Math.max(20, Math.round(imageInteraction.originalWidth - dx));
                newX = imageInteraction.originalX + (imageInteraction.originalWidth - newW);
              } else if (imageInteraction.type === 's') {
                newH = Math.max(20, Math.round(imageInteraction.originalHeight + dy));
              } else if (imageInteraction.type === 'n') {
                newH = Math.max(20, Math.round(imageInteraction.originalHeight - dy));
                newY = imageInteraction.originalY + (imageInteraction.originalHeight - newH);
              }
            }

            newX = Math.max(0, Math.min(pageWidth - newW, newX));
            newY = Math.max(0, Math.min(pageHeight - newH, newY));

            return { ...img, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (drawing) {
          const pageElement = document.getElementById(`page-${drawing.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = (e.clientX - rect.left) / zoom;
          let y = (e.clientY - rect.top) / zoom;
          const targetPage = pages[drawing.pageIndex];
          const pageWidth = targetPage ? targetPage.width : 800;
          const pageHeight = targetPage ? targetPage.height : 1131;
          x = Math.max(0, Math.min(pageWidth, x));
          y = Math.max(0, Math.min(pageHeight, y));
          setDrawing({ ...drawing, currentX: x, currentY: y });
        }
      }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          accept="application/pdf"
          className="hidden" 
      />
      <input 
          type="file" 
          ref={appendFileInputRef} 
          onChange={handleAppendPDF} 
          accept="application/pdf"
          className="hidden" 
      />
      <input 
          type="file" 
          ref={insertFileInputRef} 
          onChange={handleInsertPageBefore} 
          accept="application/pdf"
          className="hidden" 
      />
      <input 
          type="file" 
          ref={imageInputRef} 
          onChange={handleImageUpload} 
          accept="image/*"
          className="hidden" 
      />

      {deletePageConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
           <div className="bg-white p-6 rounded shadow-xl flex flex-col items-center">
              <h3 className="text-lg font-bold mb-4 text-gray-800">Bạn có chắc muốn xóa trang {deletePageConfirm.index + 1}?</h3>
              <div className="border mb-4 h-[150px]">
                 <img src={deletePageConfirm.dataUrl} className="max-h-full max-w-full" alt="Xóa trang" />
              </div>
              <div className="flex gap-4">
                 <button className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300" onClick={() => setDeletePageConfirm(null)}>Hủy</button>
                 <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold" onClick={handleDeletePageConfirm}>Xóa</button>
              </div>
           </div>
        </div>
      )}

      {showSignedWarningModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[160] p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-amber-200 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-3.5 text-white flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-100" />
                    <h3 className="font-bold text-sm tracking-wide">THÔNG BÁO VĂN BẢN ĐÃ KÝ SỐ</h3>
                 </div>
                 <button 
                   onClick={() => setShowSignedWarningModal(false)}
                   className="text-amber-100 hover:text-white p-1 rounded hover:bg-amber-600 transition-colors"
                 >
                   <X className="w-4 h-4" />
                 </button>
              </div>

              <div className="p-5 flex flex-col gap-3.5">
                 <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-lg border border-amber-200/70">
                    <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 leading-relaxed">
                       <p className="font-semibold mb-1">Chế độ xem chỉ đọc (Read-Only Mode):</p>
                       <p>Văn bản này chứa <b>chữ ký số hợp lệ</b>. Nhằm bảo toàn tính pháp lý và toàn vẹn của chữ ký số điện tử, hệ thống đã tự động <b>khóa toàn bộ các tính năng chỉnh sửa</b> (thêm chữ, sửa chữ gốc, vẽ highlight, thêm trường ký, chèn, xóa hoặc xoay trang).</p>
                    </div>
                 </div>

                 <p className="text-xs text-gray-600 italic">
                    Bạn vẫn có thể xem tài liệu, phóng to/thu nhỏ, điều hướng các trang và tải/xuất file một cách an toàn.
                 </p>

                 <div className="pt-2 flex justify-end">
                    <button
                       type="button"
                       onClick={() => setShowSignedWarningModal(false)}
                       className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                    >
                       <Check className="w-4 h-4" />
                       Đã hiểu và tiếp tục xem
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-[150]">
           <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full border border-gray-100 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                 <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-base font-bold text-gray-800">Lưu thành file với tên khác</h3>
                 </div>
                 <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded cursor-pointer"
                 >
                    <X className="w-4 h-4" />
                 </button>
              </div>
              
              <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-semibold text-gray-600">Tên file PDF mới:</label>
                 <input 
                    type="text" 
                    value={exportFilename} 
                    onChange={(e) => setExportFilename(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        exportToPDF(exportFilename);
                        setShowExportModal(false);
                      }
                    }}
                    autoFocus
                    className="text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    placeholder="Nhập tên file mới..."
                 />
              </div>

              <div className="flex flex-col gap-2">
                 <span className="text-xs font-semibold text-gray-600">Gợi ý đặt tên nhanh:</span>
                 <div className="flex gap-2">
                    <button 
                       type="button"
                       onClick={() => {
                         const nameWithoutPdf = documentName.replace(/\.pdf$/i, '');
                         setExportFilename(`${nameWithoutPdf}_da_sua.pdf`);
                       }}
                       className="flex-1 text-[11px] font-bold py-1.5 px-2 border border-gray-300 hover:border-indigo-500 hover:text-indigo-600 text-gray-600 rounded-lg bg-gray-50 hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                       + "_da_sua.pdf"
                    </button>
                    <button 
                       type="button"
                       onClick={() => {
                         const nameWithoutPdf = documentName.replace(/\.pdf$/i, '');
                         setExportFilename(`${nameWithoutPdf}_co_vung_ky.pdf`);
                       }}
                       className="flex-1 text-[11px] font-bold py-1.5 px-2 border border-gray-300 hover:border-indigo-500 hover:text-indigo-600 text-gray-600 rounded-lg bg-gray-50 hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                       + "_co_vung_ky.pdf"
                    </button>
                 </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
                 <button 
                    type="button"
                    className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                    onClick={() => setShowExportModal(false)}
                 >
                    Hủy
                  </button>
                 <button 
                    type="button"
                    className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-lg text-xs shadow transition-all cursor-pointer flex items-center gap-1.5"
                    onClick={() => {
                      exportToPDF(exportFilename);
                      setShowExportModal(false);
                    }}
                 >
                    <Save className="w-3.5 h-3.5" />
                    Lưu file mới
                 </button>
              </div>
           </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[200] backdrop-blur-xs p-4">
           <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-100 flex flex-col max-h-[85vh] overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-indigo-800 to-purple-800 text-white">
                 <div className="flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-indigo-200" />
                    <h3 className="text-base font-bold tracking-wide">HƯỚNG DẪN SỬ DỤNG CÁC CHỨC NĂNG</h3>
                 </div>
                 <button 
                    onClick={() => setShowHelpModal(false)}
                    className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
                 >
                    <X className="w-5 h-5" />
                 </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 bg-gray-50 text-xs font-semibold overflow-x-auto">
                 <button 
                    onClick={() => setActiveHelpTab('document')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'document' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <Layout className="w-4 h-4" />
                    <span>Tài liệu & Trang</span>
                 </button>
                 <button 
                    onClick={() => setActiveHelpTab('fields')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'fields' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <PenSquare className="w-4 h-4" />
                    <span>Tạo vùng ký & Văn bản</span>
                 </button>
                 <button 
                    onClick={() => setActiveHelpTab('edit_text')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'edit_text' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <Edit className="w-4 h-4" />
                    <span>Sửa chữ gốc (Xóa nền)</span>
                 </button>
                 <button 
                    onClick={() => setActiveHelpTab('highlights')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'highlights' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <Highlighter className="w-4 h-4" />
                    <span>Tô sáng (Highlight)</span>
                 </button>
                 <button 
                    onClick={() => setActiveHelpTab('shapes')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'shapes' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <Square className="w-4 h-4" />
                    <span>Kẻ ô & Khoanh vùng</span>
                 </button>
                 <button 
                    onClick={() => setActiveHelpTab('export_overwrite')}
                    className={`px-4 py-3 flex-1 min-w-[120px] text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${activeHelpTab === 'export_overwrite' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/50'}`}
                 >
                    <FileDown className="w-4 h-4" />
                    <span>Xuất file & Ghi đè</span>
                 </button>
              </div>

              {/* Content Panel */}
              <div className="p-6 overflow-y-auto text-sm leading-relaxed text-gray-600 max-h-[60vh]">
                 {activeHelpTab === 'document' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                          Quản lý tài liệu và các trang PDF
                       </h4>
                       <p>Ứng dụng xử lý file PDF <b>hoàn toàn offline trên trình duyệt</b>. Tài liệu của bạn không bao giờ được gửi lên bất kỳ máy chủ nào, đảm bảo bảo mật thông tin tuyệt đối.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Nhập tài liệu PDF mới:</strong> Click vào nút <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><FileUp className="w-3.5 h-3.5 text-indigo-600" /> Nhập PDF</span> trên thanh công cụ để tải file cần thiết kế lên hệ thống.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Thêm trang vào cuối tài liệu:</strong> Sử dụng nút <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><FilePlus className="w-3.5 h-3.5 text-indigo-600" /> Thêm trang ở cuối</span> để đính kèm nội dung từ một tệp PDF khác vào cuối tài liệu hiện tại.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Chèn trang vào vị trí bất kỳ:</strong> Khi rê chuột qua ranh giới giữa các trang hoặc các nút trang ở cột bên trái, hãy click nút <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-300 px-1 rounded font-bold">Chèn trang</span> để ghép một file PDF khác vào chính xác vị trí đó.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Xóa các trang thừa:</strong> Di chuột vào trang bất kỳ ở cột bên trái hoặc trang chính và nhấp vào nút biểu tượng <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-700 border border-red-200 px-1 py-0.5 rounded text-xs"><Trash2 className="w-3 h-3 text-red-600" /> Xóa</span> để lược bỏ trang mong muốn.
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}

                 {activeHelpTab === 'fields' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                          Thiết lập vùng ký số và trường nhập liệu
                       </h4>
                       <p>Chức năng này giúp bạn thiết lập sẵn các vị trí ký số hoặc các ô văn bản tương tác trước khi ký hoặc ban hành văn bản.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Tạo trường vùng ký số chuẩn:</strong> Chọn công cụ <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><PenSquare className="w-3.5 h-3.5 text-indigo-600" /> Trường chữ ký</span> trên thanh công cụ. Click chuột và kéo vẽ một khung hình chữ nhật tại nơi cần ký trên PDF. Bạn có thể kéo liên tục nhiều vùng ký trên nhiều trang.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Đặt tên định danh cho vùng ký:</strong> Click đúp hoặc nhấn vào tên chữ trên vùng vừa vẽ để đổi tên trực tiếp, hoặc chọn vùng đó rồi đổi tên ở <span className="font-semibold text-gray-800">Bảng thuộc tính phía bên phải</span> (ví dụ: đặt tên là <i>"ChuKyGiamDoc"</i>, <i>"NguoiKy1"</i>). Tên này sẽ lưu trữ chuẩn cấu trúc AcroForm của tài liệu PDF.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">4</div>
                             <div>
                                <strong className="text-gray-800">Điều chỉnh kích thước & Di chuyển:</strong> Chuyển về công cụ <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><MousePointer2 className="w-3.5 h-3.5 text-gray-700" /> Chọn</span> để kéo di chuyển các vùng ký hoặc thay đổi kích thước của chúng (bằng cách kéo các góc và cạnh màu đỏ/xanh). Nhấn phím <kbd className="bg-gray-100 px-1 py-0.5 border border-gray-300 rounded font-mono text-xs">Delete</kbd> để xóa nhanh một vùng đang chọn.
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}

                 {activeHelpTab === 'edit_text' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                          Tính năng sửa chữ gốc & Xóa đè văn bản (Whiteout)
                       </h4>
                       <p>Ứng dụng được trang bị bộ máy phân tích nội dung PDF nâng cao để tìm, thay đổi nội dung chữ gốc bị sai sót mà không cần file Word gốc.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Bật chế độ sửa chữ gốc:</strong> Click vào nút <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><Edit className="w-3.5 h-3.5 text-indigo-600" /> Sửa chữ gốc</span> trên thanh công cụ. Khi đó, các khối chữ gốc có thể sửa đổi trong trang PDF sẽ xuất hiện khung viền nét đứt màu cam.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Chọn và chỉnh sửa:</strong> Click trực tiếp vào khung chữ nét đứt bạn muốn sửa đổi. Bảng chỉnh sửa sẽ xuất hiện ở phía bên phải. Bạn có thể sửa trực tiếp nội dung chữ, chỉnh cỡ chữ, in đậm, in nghiêng, đổi màu sắc chữ.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Tính năng xóa đè (Whiteout):</strong> Hãy luôn bật tùy chọn <span className="font-bold text-gray-800">"Đè lên chữ gốc (Xóa nền chữ gốc)"</span>. Hệ thống sẽ tự động vẽ một hộp nền màu trắng xóa sạch chữ cũ trước khi ghi đè nội dung chữ mới vào, giúp trang PDF luôn sạch sẽ, sắc nét và không bị đè chữ nọ lên chữ kia.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">4</div>
                             <div>
                                <strong className="text-gray-800">Di chuyển vị trí chữ đã sửa:</strong> Bạn có thể điều chỉnh vị trí của chữ bằng các nút mũi tên tinh chỉnh <span className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-bold">↑ ↓ ← →</span> ở cột bên phải để đặt chữ vào đúng hàng chuẩn khớp với các dòng xung quanh.
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}

                 {activeHelpTab === 'highlights' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-amber-900 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-amber-500 rounded-full" />
                          Tô sáng (Highlight) chữ và xóa vùng tô sáng
                       </h4>
                       <p>Công cụ Tô sáng (Highlight) giúp bạn làm nổi bật các đoạn văn bản quan trọng trong tài liệu bằng các dải màu trong suốt tương tự như bút dạ quang.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Tạo vùng tô sáng:</strong> Chọn công cụ <span className="inline-flex items-center gap-0.5 bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold text-xs"><Highlighter className="w-3.5 h-3.5 text-amber-600" /> Tô sáng</span> trên Ribbon. Sau đó dùng chuột kéo thả thành hình chữ nhật bao quanh đoạn chữ cần tô sáng, hoặc nhấp chuột vào các đoạn chữ.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Tùy chỉnh màu sắc và độ đậm:</strong> Khi đang ở công cụ Tô sáng, thanh công cụ sẽ hiển thị các màu sắc phổ biến (Vàng dạ quang, Xanh lá, Xanh lam, Hồng, Cam...) và thanh chọn độ đậm (30%, 45%, 65%, 85%) hoặc chọn màu tùy ý.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Mở lên xóa đi khi cần (Xóa highlight):</strong>
                                <div className="mt-1 space-y-1 text-gray-600">
                                   <p>• <b>Xóa từng vùng:</b> Click chọn vào vùng tô sáng bất kỳ, sau đó nhấn phím <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs text-gray-800 font-bold">Delete</kbd> hoặc <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs text-gray-800 font-bold">Backspace</kbd> trên bàn phím, hoặc bấm nút tròn đỏ <Trash2 className="w-3.5 h-3.5 inline text-red-500" /> ở góc vùng tô sáng.</p>
                                   <p>• <b>Lưu & Giữ lại cho lần sau:</b> Các vùng tô sáng được tự động lưu lại trong trình duyệt và nhúng vào tệp xuất ra. Lần sau mở lên bạn hoàn toàn có thể click chọn và xóa đi dễ dàng.</p>
                                   <p>• <b>Xóa tất cả:</b> Nhấn nút <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-xs font-bold">Xóa hết</span> trên thanh công cụ để xóa toàn bộ các highlight đã tạo.</p>
                                </div>
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}

                 {activeHelpTab === 'shapes' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-red-900 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-red-600 rounded-full" />
                          Kẻ ô vuông, hình chữ nhật & Khoanh vùng (Tròn / Elip)
                       </h4>
                       <p>Công cụ kẻ khung ô và khoanh vùng giúp bạn đánh dấu, chú thích, khoanh tròn các thông tin lưu ý, ghi chú bản vẽ hoặc tạo khung nội dung rõ ràng trên trang PDF.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-700 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Chọn công cụ vẽ:</strong>
                                <div className="mt-1 space-y-1 text-gray-600">
                                   <p>• Bấm nút <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-800 border border-red-300 px-1.5 py-0.5 rounded font-bold text-xs"><Square className="w-3.5 h-3.5 text-red-600" /> Kẻ ô vuông</span> trên thanh Ribbon để vẽ hình chữ nhật / ô vuông.</p>
                                   <p>• Bấm nút <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded font-bold text-xs"><Circle className="w-3.5 h-3.5 text-rose-600" /> Khoanh vùng</span> trên thanh Ribbon để khoanh tròn / elip đánh dấu vùng cần chú ý.</p>
                                   <p>• Sau khi chọn công cụ, nhấn giữ chuột và kéo trên trang để vẽ hình theo kích thước tùy thích.</p>
                                </div>
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-700 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Tùy biến viền và nền màu:</strong>
                                <div className="mt-1 space-y-1 text-gray-600">
                                   <p>• <b>Kiểu hình:</b> Dễ dàng đổi qua lại giữa Hình chữ nhật ↔ Tròn / Elip bất kỳ lúc nào.</p>
                                   <p>• <b>Màu viền & Độ dày:</b> Lựa chọn màu sắc nổi bật (Đỏ, Cam, Vàng, Xanh, Tím, Đen...) hoặc bảng màu tùy chỉnh, cùng độ dày viền từ 1px đến 6px.</p>
                                   <p>• <b>Kiểu nét viền:</b> Chọn viền Nét liền (Solid) hoặc Nét đứt (Dashed).</p>
                                   <p>• <b>Nền hình:</b> Trong suốt, Phủ màu mờ 15% hoặc Nền trắng để che nền bên dưới.</p>
                                </div>
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-700 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Điều chỉnh kích thước & Di chuyển:</strong>
                                <div className="mt-1 space-y-1 text-gray-600">
                                   <p>• Click vào hình để hiển thị 8 điểm kéo (góc và cạnh) để phóng to thu nhỏ chính xác.</p>
                                   <p>• Kéo rê hình để di chuyển đến vị trí mong muốn, hoặc dùng 4 phím mũi tên <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded font-bold text-xs">↑ ↓ ← →</kbd> để tinh chỉnh từng pixel.</p>
                                   <p>• Bấm phím <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs text-gray-800 font-bold">Delete</kbd> hoặc nút xóa màu đỏ ở góc hình để xóa hình.</p>
                                </div>
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 text-red-700 text-xs font-bold">4</div>
                             <div>
                                <strong className="text-gray-800">Lưu & Mở lại chỉnh sửa linh hoạt:</strong> Các ô vuông và vùng khoanh được lưu dưới dạng lớp hiển thị thông minh (không bị in chết cứng vào nền ảnh PDF), giúp bạn mở lại file bất kỳ lúc nào để di chuyển, co giãn, đổi màu viền hoặc xóa đi dễ dàng.
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}

                 {activeHelpTab === 'export_overwrite' && (
                    <div className="flex flex-col gap-4">
                       <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <span className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                          Xuất file PDF mới và cách ghi đè trực tiếp lên file cũ
                       </h4>
                       <p>Khi hoàn tất thiết kế hoặc sửa đổi tài liệu, bạn cần tải về máy để lưu trữ hoặc thực hiện ký số.</p>
                       <ul className="space-y-3 pl-1">
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">1</div>
                             <div>
                                <strong className="text-gray-800">Xuất tài liệu:</strong> Nhấn nút <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 border border-blue-500 hover:bg-blue-100 px-2 py-0.5 rounded font-bold text-xs"><FileDown className="w-4 h-4 text-blue-600" /> Xuất file PDF</span> ở thanh Ribbon để mở bảng cấu hình tải xuống.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">2</div>
                             <div>
                                <strong className="text-gray-800">Cách ghi đè lên file cũ (Để không làm đúp file):</strong>
                                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 leading-normal space-y-1.5">
                                   <p>Để lưu trực tiếp đè vào file cũ ban đầu nhằm giữ nguyên tên và vị trí lưu trữ:</p>
                                   <ol className="list-decimal list-inside pl-1 font-medium text-blue-900 space-y-0.5">
                                      <li>Trong bảng xuất hiện, nhấp chọn mẫu đặt tên nhanh là <span className="bg-white border px-1.5 py-0.5 rounded text-[11px] border-gray-300 text-gray-700 font-bold">"Giữ tên gốc"</span>.</li>
                                      <li>Bấm nút <span className="bg-indigo-600 text-white font-bold px-2 py-0.5 rounded text-[11px]">"Tải xuống PDF"</span>.</li>
                                      <li>Khi hộp thoại lưu của trình duyệt hiện ra, bạn di chuyển đến đúng thư mục chứa tệp tin cũ trên máy tính rồi ấn nút <span className="bg-gray-100 border text-gray-800 px-1.5 py-0.5 text-[11px] rounded font-bold">Save</span>.</li>
                                      <li>Trình duyệt sẽ thông báo tệp tin đã tồn tại và hỏi có muốn ghi đè (Replace) hay không, hãy chọn <span className="font-bold text-indigo-900">Yes (hoặc Replace)</span> để ghi đè file cũ thành công.</li>
                                   </ol>
                                </div>
                             </div>
                          </li>
                       </ul>
                    </div>
                 )}
              </div>

              {/* Footer */}
              <div className="flex justify-end items-center px-6 py-4 border-t border-gray-150 bg-gray-50">
                 <button 
                    onClick={() => setShowHelpModal(false)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-md transition-all flex items-center gap-1.5"
                 >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Đã hiểu, đóng hướng dẫn</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Direct Save Local File Modal (khi trình duyệt trong khung xem trước cần cấp quyền tệp gốc) */}
      {pendingDirectSaveBytes && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Save className="w-5 h-5 text-emerald-100" />
                <div>
                  <h3 className="font-bold text-sm">Ghi đè trực tiếp lên tệp gốc trên máy</h3>
                  <p className="text-[11px] text-emerald-100">{pendingDirectSaveBytes.filename}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDirectSaveBytes(null)}
                className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 text-xs text-gray-700">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900 leading-relaxed">
                <span className="font-bold">✓ Nội dung sửa chữa đã được áp dụng trực tiếp vào trang PDF trên màn hình.</span>
                <p className="mt-1 text-[11px] text-emerald-800">
                  Do bạn đang mở trong khung xem trước (Preview), trình duyệt chặn hộp thoại chọn tệp trực tiếp. Để <b>ghi đè thẳng vào file gốc trên máy mà không sinh ra file (1).pdf</b>, hãy chọn 1 trong 2 cách dưới đây:
                </p>
              </div>

              {/* Cách 1: Kéo thả file gốc vào ô để cấp quyền ghi đè trực tiếp */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsModalDropDragOver(true);
                }}
                onDragLeave={() => setIsModalDropDragOver(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsModalDropDragOver(false);
                  try {
                    const firstItem = e.dataTransfer.items?.[0] as any;
                    if (firstItem && typeof firstItem.getAsFileSystemHandle === 'function') {
                      const handle = await firstItem.getAsFileSystemHandle();
                      if (handle && handle.kind === 'file' && typeof handle.createWritable === 'function') {
                        fileHandleRef.current = handle;
                        setHasDirectFileHandle(true);
                        if (handle.name) setDocumentName(handle.name);
                        const writable = await handle.createWritable();
                        await writable.write(pendingDirectSaveBytes.bytes);
                        await writable.close();
                        const targetName = handle.name || pendingDirectSaveBytes.filename;
                        setPendingDirectSaveBytes(null);
                        triggerSaveToast(`Đã lưu "${targetName}"`, 'Đã ghi đè trực tiếp lên tệp gốc trên máy.');
                        return;
                      }
                    }
                    alert('Trình duyệt của bạn không cấp quyền ghi từ thao tác kéo thả trong khung này. Vui lòng bấm nút "Mở trên Tab riêng" bên dưới để lưu trực tiếp.');
                  } catch (err: any) {
                    if (err && err.name === 'AbortError') return;
                    alert('Không thể ghi đè trực tiếp trong khung xem trước. Hãy bấm "Mở trên Tab riêng" bên dưới.');
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
                  isModalDropDragOver
                    ? 'border-emerald-500 bg-emerald-50/80 scale-[1.01]'
                    : 'border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50/70'
                }`}
              >
                <FolderOpen className="w-7 h-7 text-indigo-600 mx-auto mb-1.5" />
                <p className="font-bold text-gray-800 text-xs">
                  Cách 1: Kéo thả tệp "{pendingDirectSaveBytes.filename}" từ máy tính vào ô này
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Ứng dụng sẽ nhận quyền tệp gốc và ghi đè trực tiếp ngay lập tức (các lần bấm Save sau sẽ tự lưu thẳng)
                </p>
              </div>

              {/* Cách 2: Mở trên Tab riêng (Chế độ Desktop) */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const bytes = pendingDirectSaveBytes.bytes;
                    setPendingDirectSaveBytes(null);
                    handleOpenInStandaloneTab(bytes);
                  }}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Cách 2: Mở trên Tab riêng (Hoạt động 100% như phần mềm trên máy)</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    const { bytes, filename } = pendingDirectSaveBytes;
                    setPendingDirectSaveBytes(null);
                    const blob = new Blob([bytes], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    triggerSaveToast(`Đã tải xuống "${filename}"`, 'Đã tải tệp PDF về máy.');
                  }}
                  className="text-gray-500 hover:text-gray-800 font-medium underline cursor-pointer text-[11px]"
                >
                  Hoặc tải xuống bản cập nhật qua trình duyệt
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDirectSaveBytes(null)}
                  className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Header / Title Bar */}
      <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white shadow-md px-4 py-2.5 flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[15px] font-bold tracking-wide flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-100" />
            {documentName ? `${documentName} - ` : ''}Công cụ ký số PDF
            <span className="text-xs font-normal text-indigo-200 ml-1">Tác giả: Tuấn Anh-KH-QNPC</span>
          </span>
          {hasDirectFileHandle && (
            <span className="inline-flex items-center gap-1 bg-emerald-500/25 border border-emerald-300/40 text-emerald-100 text-[11px] px-2 py-0.5 rounded-full font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-300" />
              Đã kết nối file gốc (Lưu trực tiếp)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {isInIframe && (
            <button
              type="button"
              onClick={() => handleOpenInStandaloneTab()}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white font-semibold px-3 py-1.5 rounded-lg border border-white/25 transition-all cursor-pointer shadow-xs"
              title="Mở ứng dụng trên Tab trình duyệt riêng để đọc và ghi đè trực tiếp lên file PDF trên máy mà không tạo file (1).pdf"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-300" />
              <span>Mở Tab riêng (Lưu trực tiếp file gốc)</span>
            </button>
          )}
          {isProcessing && (
            <div className="flex items-center text-xs text-white bg-indigo-500 bg-opacity-40 px-3 py-1.5 rounded-full backdrop-blur-sm gap-2 shadow-inner border border-indigo-400">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-100" />
              <span className="font-medium">Đang xử lý PDF...</span>
            </div>
          )}
        </div>
      </div>

      {isDigitallySigned && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-amber-800 text-xs font-medium z-10 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
             <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
             </span>
             <span>⚠️ <b>CẢNH BÁO VĂN BẢN ĐÃ KÝ SỐ (CHẾ ĐỘ CHỈ ĐỌC):</b> Tài liệu này đã có chữ ký số hợp lệ. Toàn bộ tính năng chỉnh sửa (thêm chữ, sửa chữ gốc, highlight, thêm trường ký, chèn/xóa/xoay trang) đã được khóa để bảo toàn nguyên vẹn chữ ký số.</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-100/80 text-amber-900 px-2.5 py-1 rounded-md text-[11px] font-bold border border-amber-300">
             <Lock className="w-3.5 h-3.5 text-amber-700" />
             Chỉ đọc (Read-only)
          </div>
        </div>
      )}

      {/* Ribbon */}
      <div className="bg-gradient-to-b from-[#f8f9fa] to-[#f1f3f5] border-b border-gray-300 px-3 py-2 pb-3 flex flex-wrap items-start gap-x-2.5 gap-y-3 z-40 relative shadow-sm min-h-[86px]">
        {/* File Group */}
        <div className="flex items-start space-x-0.5 relative group/file">
           <button 
             onClick={handleOpenPdfClick}
             className="flex flex-col items-center justify-start w-[58px] h-[64px] rounded-lg border border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group cursor-pointer"
             title="Mở tệp PDF từ máy tính (hỗ trợ lưu trực tiếp lên tệp gốc)"
           >
             <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <FileUp className="w-5 h-5 text-indigo-600 z-10 drop-shadow-sm" strokeWidth={1.5} />
             <span className="text-[10px] font-medium leading-[1.1] text-center text-gray-700 z-10">Nhập PDF</span>
           </button>
           <button 
             onClick={() => {
               if (isDigitallySigned) {
                 alert("Tài liệu hiện tại đã được ký số. Không thể ghép thêm trang để tránh làm hỏng chữ ký số.");
                 return;
               }
               appendFileInputRef.current?.click();
             }}
             disabled={isDigitallySigned}
             className={`flex flex-col items-center justify-start w-[58px] h-[64px] rounded-lg border ${
               isDigitallySigned 
                 ? 'opacity-40 cursor-not-allowed border-transparent bg-gray-50' 
                 : 'border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm'
             } p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group`}
             title={isDigitallySigned ? "Đã khóa do tài liệu đã ký số" : "Thêm các trang từ file PDF khác vào cuối tài liệu này"}
           >
             {!isDigitallySigned && <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
             <FilePlus className={`w-5 h-5 z-10 drop-shadow-sm ${isDigitallySigned ? 'text-gray-400' : 'text-indigo-600'}`} strokeWidth={1.5} />
             <span className={`text-[10px] font-medium leading-[1.1] text-center z-10 ${isDigitallySigned ? 'text-gray-400' : 'text-gray-700'}`}>Thêm trang<br/>ở cuối</span>
           </button>
           <div className="absolute -bottom-2 inset-x-0 text-center text-[9px] text-indigo-800/60 uppercase tracking-wider font-semibold pointer-events-none">Tài liệu</div>
        </div>

        <div className="w-px h-15 bg-gray-300 self-center"></div>

        {/* Tools Group */}
        <div className="flex items-start space-x-0.5 relative">
           <RibbonButton 
              icon={PanelLeft} 
              label={"Bảng\ntrang"} 
              active={showPageSidebar} 
              onClick={() => setShowPageSidebar(!showPageSidebar)} 
           />
           <RibbonButton icon={MousePointer2} label="Chọn" active={activeTool === 'Select'} onClick={() => setActiveTool('Select')} />
           <RibbonButton 
              icon={PenSquare} 
              label={"Trường\nchữ ký"} 
              active={activeTool === 'Signature Field'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể thêm trường ký vì tài liệu đã được ký số" : "Thêm ô ký số"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể thêm trường ký mới.");
                  return;
                }
                setActiveTool('Signature Field');
              }}
           />
           <RibbonButton 
              icon={Type} 
              label={"Thêm chữ\n(Text box)"} 
              active={activeTool === 'Text Box'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể thêm văn bản vì tài liệu đã được ký số" : "Chèn khung văn bản mới"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể thêm khung chữ mới.");
                  return;
                }
                setActiveTool('Text Box');
                setSelectedFieldId(null);
                setSelectedTextId(null);
                setSelectedHighlightId(null);
                ensureFontsLoaded();
              }}
           />
           <RibbonButton 
              icon={Edit} 
              label={"Sửa chữ\ngốc"} 
              active={activeTool === 'Edit Text'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể sửa chữ gốc vì tài liệu đã được ký số" : "Sửa trực tiếp các dòng chữ trong file PDF"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể sửa nội dung chữ gốc.");
                  return;
                }
                setActiveTool('Edit Text');
              }}
           />
           <RibbonButton 
              icon={Highlighter} 
              label={"Tô sáng\n(Highlight)"} 
              active={activeTool === 'Highlight'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể tô sáng/xóa nền vì tài liệu đã được ký số" : "Tô sáng văn bản hoặc che nền trắng"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể tô sáng hoặc che nền.");
                  return;
                }
                setActiveTool('Highlight');
                setSelectedFieldId(null);
                setSelectedTextId(null);
                setSelectedShapeId(null);
              }}
           />
           <RibbonButton 
              icon={Square} 
              label={"Kẻ ô vuông\n(Khung)"} 
              active={activeTool === 'Rectangle'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể vẽ vì tài liệu đã được ký số" : "Nhấn giữ và kéo chuột để kẻ ô vuông hoặc khung chữ nhật"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể vẽ khung mới.");
                  return;
                }
                setActiveTool(activeTool === 'Rectangle' ? 'Select' : 'Rectangle');
                setShapeType('rectangle');
                setSelectedFieldId(null);
                setSelectedTextId(null);
                setSelectedHighlightId(null);
                setSelectedTextBoxId(null);
                setSelectedShapeId(null);
              }}
           />
           <RibbonButton 
              icon={Circle} 
              label={"Khoanh vùng\n(Tròn/Elip)"} 
              active={activeTool === 'Circle'} 
              disabled={isDigitallySigned}
              title={isDigitallySigned ? "Không thể vẽ vì tài liệu đã được ký số" : "Nhấn giữ và kéo chuột để khoanh vùng hình tròn hoặc bầu dục"}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể khoanh vùng mới.");
                  return;
                }
                setActiveTool(activeTool === 'Circle' ? 'Select' : 'Circle');
                setShapeType('circle');
                setSelectedFieldId(null);
                setSelectedTextId(null);
                setSelectedHighlightId(null);
                setSelectedTextBoxId(null);
                setSelectedShapeId(null);
                setSelectedImageId(null);
              }}
           />
           <RibbonButton 
              icon={ImageIcon} 
              label={"Chèn ảnh\nvào PDF"} 
              active={Boolean(selectedImageId)} 
              disabled={isDigitallySigned}
              onClick={() => {
                if (isDigitallySigned) {
                  alert("Tài liệu hiện tại đã được ký số. Không thể chèn ảnh.");
                  return;
                }
                imageInputRef.current?.click();
              }}
           />
           <div className="absolute -bottom-2 inset-x-0 text-center text-[9px] text-gray-500 uppercase tracking-wider pointer-events-none">Công cụ</div>
        </div>

        <div className="w-px h-15 bg-gray-300 self-center"></div>

        {/* History Group (Undo / Redo) */}
        <div className="flex items-start space-x-0.5 relative">
           <RibbonButton 
              icon={Undo2} 
              label={"Hoàn tác\n(Ctrl+Z)"} 
              active={false}
              disabled={!canUndo}
              title={canUndo ? `Hoàn tác thao tác vừa thực hiện (Ctrl+Z) - Còn ${undoStack.length} bước` : "Chưa có thao tác nào để hoàn tác"}
              onClick={handleUndo}
           />
           <RibbonButton 
              icon={Redo2} 
              label={"Làm lại\n(Ctrl+Y)"} 
              active={false}
              disabled={!canRedo}
              title={canRedo ? `Làm lại thao tác vừa hoàn tác (Ctrl+Y / Ctrl+Shift+Z) - Còn ${redoStack.length} bước` : "Chưa có thao tác nào để làm lại"}
              onClick={handleRedo}
           />
           <div className="absolute -bottom-2 inset-x-0 text-center text-[9px] text-gray-500 uppercase tracking-wider pointer-events-none">Lịch sử</div>
        </div>
        
        {activeTool === 'Edit Text' && (() => {
           const currentSelectedText = pdfTexts.find(t => t.id === selectedTextId);
           const activeSel =
             currentSelectedText &&
             editSelectionRange &&
             editSelectionRange.id === currentSelectedText.id &&
             editSelectionRange.end > editSelectionRange.start
               ? editSelectionRange
               : null;

           let activeSpanStyle: Partial<TextSpan> | null = null;
           if (currentSelectedText && activeSel) {
             const spans = getNormalizedSpans(currentSelectedText);
             let p = 0;
             for (const s of spans) {
               if (activeSel.start >= p && activeSel.start < p + s.text.length) {
                 activeSpanStyle = s;
                 break;
               }
               p += s.text.length;
             }
           }

           const displayFontFamily = activeSpanStyle?.fontFamily || currentSelectedText?.customFontFamily || 'Times New Roman';
           const displayFontSize = Math.round(((activeSpanStyle?.fontSize || currentSelectedText?.customFontSize || currentSelectedText?.fontSize || 13)) * 10) / 10;
           const displayBold = activeSpanStyle?.isBold !== undefined ? !!activeSpanStyle.isBold : !!currentSelectedText?.isBold;
           const displayItalic = activeSpanStyle?.isItalic !== undefined ? !!activeSpanStyle.isItalic : !!currentSelectedText?.isItalic;
           const displayColor = activeSpanStyle?.color || currentSelectedText?.customColor || '#000000';

           const QUICK_TEXT_COLORS = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#d97706', '#9333ea'];

           return (
             <>
               <div className="w-px h-15 bg-gray-300 self-center hidden xl:block"></div>

               {/* Formatting Ribbon Group */}
               <div
                 id="edit-text-ribbon-bar"
                 className="flex flex-wrap items-center gap-2 bg-white/95 border border-indigo-200 rounded-xl px-2.5 py-1.5 min-h-[64px] shadow-xs relative"
               >
                 {/* Font family selector */}
                 <div className="flex flex-col gap-0.5">
                   <div className="flex items-center justify-between">
                     <span className="text-[9px] font-bold text-indigo-950 uppercase tracking-wider">Phông chữ</span>
                     {currentSelectedText && (
                       <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                         <Check className="w-2.5 h-2.5 stroke-[3]" /> Nhận diện
                       </span>
                     )}
                   </div>
                   <select 
                     value={displayFontFamily}
                     disabled={!selectedTextId}
                     onChange={(e) => {
                       if (selectedTextId) {
                         handleTextPropChange(selectedTextId, { customFontFamily: e.target.value, isModified: true });
                       }
                     }}
                     className="text-xs font-semibold bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed max-w-[155px]"
                     style={{ fontFamily: getFontFamily(displayFontFamily) }}
                   >
                     <option value="Times New Roman">Times New Roman (Chuẩn VN)</option>
                     <option value="Arial">Arial (Không chân)</option>
                     <option value="Roboto">Roboto (Hiện đại)</option>
                     <option value="Courier New">Courier New (Đơn khoảng)</option>
                   </select>
                 </div>

                 {/* Font size input & quick increment */}
                 <div className="flex flex-col gap-0.5">
                   <span className="text-[9px] font-bold text-indigo-950 uppercase tracking-wider">Cỡ chữ</span>
                   <div className="flex items-center gap-1">
                     <input 
                       type="number"
                       min={4}
                       max={120}
                       step={0.5}
                       value={displayFontSize}
                       onChange={(e) => {
                         const val = parseFloat(e.target.value);
                         if (selectedTextId && !isNaN(val) && val > 0) {
                           handleTextPropChange(selectedTextId, { customFontSize: val, isModified: true });
                         }
                       }}
                       disabled={!selectedTextId}
                       className="w-13 text-xs font-bold text-center bg-white border border-gray-300 rounded py-1 outline-none focus:ring-1 focus:ring-indigo-500 shadow-xs disabled:opacity-50"
                     />
                     <div className="flex flex-col gap-0.5">
                       <button 
                         type="button"
                         title="Tăng cỡ chữ (+1pt)"
                         disabled={!selectedTextId}
                         onMouseDown={(e) => e.preventDefault()}
                         onClick={() => {
                           if (selectedTextId && currentSelectedText) {
                             handleTextPropChange(selectedTextId, { customFontSize: displayFontSize + 1, isModified: true });
                           }
                         }}
                         className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-indigo-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 disabled:opacity-40 cursor-pointer"
                       >
                         ▲
                       </button>
                       <button 
                         type="button"
                         title="Giảm cỡ chữ (-1pt)"
                         disabled={!selectedTextId}
                         onMouseDown={(e) => e.preventDefault()}
                         onClick={() => {
                           if (selectedTextId && currentSelectedText) {
                             handleTextPropChange(selectedTextId, { customFontSize: Math.max(4, displayFontSize - 1), isModified: true });
                           }
                         }}
                         className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-indigo-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 disabled:opacity-40 cursor-pointer"
                       >
                         ▼
                       </button>
                     </div>
                   </div>
                 </div>

                 <div className="w-px h-10 bg-indigo-200/80"></div>

                 {/* Bold, Italic & Color */}
                 <div className="flex flex-col gap-0.5">
                   <span className="text-[9px] font-bold text-indigo-950 uppercase tracking-wider">Định dạng & Màu</span>
                   <div className="flex items-center gap-1">
                     <button 
                       type="button"
                       title="In đậm (Bold) - Bôi đen từ để in đậm riêng từng từ"
                       disabled={!selectedTextId}
                       onMouseDown={(e) => e.preventDefault()}
                       onClick={() => {
                         if (selectedTextId && currentSelectedText) {
                           handleTextPropChange(selectedTextId, { isBold: !displayBold, isModified: true });
                         }
                       }}
                       className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-xs font-serif font-black cursor-pointer ${
                         displayBold 
                           ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm font-bold' 
                           : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
                       } disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       B
                     </button>
                     <button 
                       type="button"
                       title="In nghiêng (Italic) - Bôi đen từ để in nghiêng riêng từng từ"
                       disabled={!selectedTextId}
                       onMouseDown={(e) => e.preventDefault()}
                       onClick={() => {
                         if (selectedTextId && currentSelectedText) {
                           handleTextPropChange(selectedTextId, { isItalic: !displayItalic, isModified: true });
                         }
                       }}
                       className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-xs font-serif italic font-bold cursor-pointer ${
                         displayItalic 
                           ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm font-bold' 
                           : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
                       } disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       I
                     </button>

                     {/* Quick color swatches */}
                     <div className="flex items-center gap-1 px-1">
                       {QUICK_TEXT_COLORS.map(c => (
                         <button
                           key={c}
                           type="button"
                           disabled={!selectedTextId}
                           onMouseDown={(e) => e.preventDefault()}
                           onClick={() => {
                             if (selectedTextId) {
                               handleTextPropChange(selectedTextId, { customColor: c, isModified: true });
                             }
                           }}
                           className={`w-4 h-4 rounded-full border transition-transform cursor-pointer disabled:opacity-40 ${
                             displayColor.toLowerCase() === c.toLowerCase()
                               ? 'scale-120 border-indigo-600 ring-2 ring-indigo-300'
                               : 'border-gray-300 hover:scale-110'
                           }`}
                           style={{ backgroundColor: c }}
                           title={`Màu chữ ${c}`}
                         />
                       ))}
                     </div>

                     {/* Color picker */}
                     <label 
                       className={`w-7 h-7 rounded border border-gray-300 flex flex-col items-center justify-center cursor-pointer bg-white overflow-hidden shadow-xs hover:border-indigo-400 ${!selectedTextId ? 'opacity-40 cursor-not-allowed' : ''}`}
                       title="Chọn màu tùy chỉnh"
                     >
                       <span className="text-[11px] font-black leading-none" style={{ color: displayColor }}>A</span>
                       <span className="w-4 h-1 mt-0.5 rounded-full" style={{ backgroundColor: displayColor }}></span>
                       <input 
                         type="color"
                         disabled={!selectedTextId}
                         value={displayColor}
                         onChange={(e) => {
                           if (selectedTextId) {
                             handleTextPropChange(selectedTextId, { customColor: e.target.value, isModified: true });
                           }
                         }}
                         className="sr-only"
                       />
                     </label>
                   </div>
                 </div>

                 <div className="w-px h-10 bg-indigo-200/80"></div>

                 {/* Options & Per-word Action */}
                 <div className="flex flex-col justify-between h-full py-0.5 gap-1">
                   <div className="flex items-center gap-2.5">
                     <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-gray-700">
                       <input 
                         type="checkbox" 
                         checked={showTextHighlights} 
                         onChange={(e) => setShowTextHighlights(e.target.checked)}
                         className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                       />
                       <span>Khung viền chữ</span>
                     </label>

                     <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-semibold text-gray-700">
                       <input 
                         type="checkbox" 
                         checked={currentSelectedText?.hasBackground !== false} 
                         disabled={!selectedTextId}
                         onChange={(e) => {
                           if (selectedTextId) {
                             handleTextPropChange(selectedTextId, { hasBackground: e.target.checked, isModified: true });
                           }
                         }}
                         className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                       />
                       <span>Xóa nền gốc</span>
                     </label>
                   </div>

                   <div className="flex items-center gap-2">
                     {activeSel && currentSelectedText ? (
                       <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-semibold truncate max-w-[200px]">
                         Đang chọn từ: "{currentSelectedText.text.slice(activeSel.start, activeSel.end)}"
                       </span>
                     ) : currentSelectedText ? (
                       <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono font-medium truncate max-w-[200px]">
                         {displayFontFamily} {displayFontSize}pt (Bôi đen từ để chỉnh riêng)
                       </span>
                     ) : (
                       <span className="text-[10px] text-indigo-600/80 italic font-medium flex items-center gap-1">
                         <Sparkles className="w-3 h-3 text-indigo-500" /> Nhấp vào chữ (hoặc bôi đen từng từ) để chỉnh
                       </span>
                     )}

                     {currentSelectedText?.isModified && (
                       <button
                         type="button"
                         onClick={() => {
                           if (selectedTextId) {
                             handleRestoreText(selectedTextId);
                             setSelectedTextId(null);
                           }
                         }}
                         className="text-[10px] text-red-600 hover:text-red-800 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
                         title="Khôi phục chữ gốc"
                       >
                         <RotateCcw className="w-2.5 h-2.5" /> Gốc
                       </button>
                     )}
                   </div>
                 </div>

                 <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-indigo-800/60 uppercase tracking-wider font-semibold">Định dạng chữ</div>
               </div>
             </>
           );
        })()}

        {activeTool === 'Highlight' && (() => {
          const selectedH = highlights.find(h => h.id === selectedHighlightId);

          return (
            <>
              <div className="w-px h-15 bg-gray-300 self-center hidden xl:block"></div>

              {/* Highlight & Eraser Toolbar Group */}
              <div className="flex flex-wrap items-center gap-2.5 bg-white/95 border border-amber-300 rounded-xl px-2.5 py-1.5 min-h-[64px] shadow-xs relative">
                {/* Mode Selector: Tô sáng vs Tẩy vết màu cũ */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-amber-950 uppercase tracking-wider">Chế độ</span>
                  <div className="flex items-center bg-amber-50/80 p-0.5 rounded-lg border border-amber-200">
                    <button
                      type="button"
                      onClick={() => setHighlightToolMode('highlight')}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                        highlightToolMode === 'highlight'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'text-amber-900 hover:bg-amber-100/60'
                      }`}
                      title="Kéo chuột để tô sáng văn bản"
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                      <span>Tô sáng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHighlightToolMode('eraser')}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                        highlightToolMode === 'eraser'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-blue-900 hover:bg-blue-50'
                      }`}
                      title="Kéo chuột phủ lên vệt màu vàng đã in chết vào file để xóa sạch nền và giữ nguyên chữ đen"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span>Tẩy vết màu cũ</span>
                    </button>
                  </div>
                </div>

                <div className="h-9 w-px bg-amber-200/80"></div>

                {highlightToolMode === 'highlight' ? (
                  <>
                    {/* Color Palette */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold text-amber-950 uppercase tracking-wider">Màu tô sáng</span>
                      <div className="flex items-center gap-1.5">
                        {HIGHLIGHT_COLORS.map(c => (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              setHighlightColor(c.color);
                              if (selectedHighlightId) {
                                setHighlights(prev => prev.map(h => h.id === selectedHighlightId ? { ...h, color: c.color, isWhiteout: false } : h));
                              }
                            }}
                            className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                              (highlightColor || '').toLowerCase() === (c.color || '').toLowerCase() ? 'border-amber-600 scale-115 shadow-sm ring-2 ring-amber-300' : 'border-white hover:scale-105'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.label}
                          />
                        ))}
                        {/* Custom Color Input */}
                        <label className="relative w-5 h-5 rounded-full border border-gray-300 overflow-hidden cursor-pointer flex items-center justify-center bg-gray-100 hover:opacity-90" title="Chọn màu tùy chỉnh">
                          <input 
                            type="color" 
                            value={highlightColor} 
                            onChange={(e) => {
                              setHighlightColor(e.target.value);
                              if (selectedHighlightId) {
                                setHighlights(prev => prev.map(h => h.id === selectedHighlightId ? { ...h, color: e.target.value, isWhiteout: false } : h));
                              }
                            }}
                            className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="h-9 w-px bg-amber-200/80"></div>

                    {/* Opacity Selection */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-amber-950 uppercase tracking-wider">Độ đậm</span>
                        <span className="text-[9px] font-semibold text-amber-800">{Math.round(highlightOpacity * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[0.3, 0.45, 0.65, 0.85].map(op => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => {
                              setHighlightOpacity(op);
                              if (selectedHighlightId) {
                                setHighlights(prev => prev.map(h => h.id === selectedHighlightId ? { ...h, opacity: op } : h));
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                              Math.abs(highlightOpacity - op) < 0.05
                                ? 'bg-amber-500 text-white border-amber-600 font-bold'
                                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {Math.round(op * 100)}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Eraser Info Box */
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-blue-900 text-[11px] max-w-[280px] leading-tight">
                    <Eraser className="w-5 h-5 text-blue-600 shrink-0" />
                    <span>Kéo chuột phủ lên vết màu vàng cũ đã in chết vào file để xóa sạch nền và giữ nguyên chữ nét!</span>
                  </div>
                )}

                <div className="h-9 w-px bg-amber-200/80"></div>

                {/* Actions & Delete */}
                <div className="flex items-center gap-2">
                  {selectedHighlightId ? (
                    <div className="flex items-center gap-1.5">
                      {selectedH?.isWhiteout ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHighlights(prev => prev.map(h => h.id === selectedHighlightId ? { ...h, isWhiteout: false, color: highlightColor, opacity: highlightOpacity } : h));
                          }}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          title="Đổi thành khung tô sáng"
                        >
                          <Highlighter className="w-3 h-3 text-amber-600" />
                          <span>Thành tô sáng</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setHighlights(prev => prev.map(h => h.id === selectedHighlightId ? { ...h, isWhiteout: true, color: '#ffffff', opacity: 1 } : h));
                          }}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                          title="Đổi thành tẩy nền trắng để xóa vết màu cũ"
                        >
                          <Eraser className="w-3 h-3 text-blue-600" />
                          <span>Tẩy nền</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setHighlights(prev => prev.filter(h => h.id !== selectedHighlightId));
                          setSelectedHighlightId(null);
                        }}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Xóa vùng đang chọn (Phím Delete)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-900 leading-tight max-w-[130px]">
                      {highlightToolMode === 'highlight' ? 'Kéo chuột tạo khung tô sáng, hoặc click vào chữ' : 'Kéo chuột quét qua vết màu vàng cần tẩy'}
                    </div>
                  )}

                  {highlights.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Bạn có chắc chắn muốn xóa tất cả ${highlights.length} vùng tô sáng/tẩy màu?`)) {
                          setHighlights([]);
                          setSelectedHighlightId(null);
                        }
                      }}
                      className="px-2 py-1 bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-gray-600 border border-gray-200 rounded text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                      title="Xóa toàn bộ các highlight trong tài liệu"
                    >
                      <X className="w-3 h-3" />
                      <span>Xóa hết ({highlights.length})</span>
                    </button>
                  )}
                </div>

                <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-amber-900/60 uppercase tracking-wider font-semibold">Tùy chọn tô sáng & Tẩy vết màu cũ</div>
              </div>
            </>
          );
        })()}

        {(activeTool === 'Text Box' || selectedTextBoxId !== null) && (() => {
          const selectedTb = textBoxes.find(t => t.id === selectedTextBoxId);
          const activeTbSel =
            selectedTb &&
            tbSelectionRange &&
            tbSelectionRange.id === selectedTb.id &&
            tbSelectionRange.end > tbSelectionRange.start
              ? tbSelectionRange
              : null;

          let activeTbSpanStyle: Partial<TextSpan> | null = null;
          if (selectedTb && activeTbSel) {
            const spans = getNormalizedTextBoxSpans(selectedTb);
            let p = 0;
            for (const s of spans) {
              if (activeTbSel.start >= p && activeTbSel.start < p + s.text.length) {
                activeTbSpanStyle = s;
                break;
              }
              p += s.text.length;
            }
          }

          const currentFont = activeTbSpanStyle?.fontFamily || selectedTb?.fontFamily || tbFontFamily;
          const currentSize = Math.round(((activeTbSpanStyle?.fontSize || selectedTb?.fontSize || tbFontSize)) * 10) / 10;
          const currentLineHeight = selectedTb?.lineHeight || tbLineHeight || 1.25;
          const currentBold = activeTbSpanStyle?.isBold !== undefined
            ? !!activeTbSpanStyle.isBold
            : selectedTb !== undefined
            ? !!selectedTb.isBold
            : tbIsBold;
          const currentItalic = activeTbSpanStyle?.isItalic !== undefined
            ? !!activeTbSpanStyle.isItalic
            : selectedTb !== undefined
            ? !!selectedTb.isItalic
            : tbIsItalic;
          const currentColor = activeTbSpanStyle?.color || selectedTb?.color || tbColor;
          const currentAlign = selectedTb?.textAlign || tbTextAlign;
          const currentHasBg = selectedTb !== undefined ? !!selectedTb.hasBackground : tbHasBackground;
          const currentHasBorder = selectedTb !== undefined ? !!selectedTb.hasBorder : tbHasBorder;
          const QUICK_TB_COLORS = ['#000000', '#ef4444', '#2563eb', '#16a34a', '#d97706', '#9333ea'];

          return (
            <>
              <div className="w-px h-15 bg-gray-300 self-center hidden xl:block"></div>

              {/* Text Box Formatting Ribbon Group */}
              <div
                id="textbox-ribbon-bar"
                className="flex flex-wrap items-center gap-2 bg-white/95 border border-blue-300 rounded-xl px-2.5 py-1.5 min-h-[64px] shadow-xs relative"
              >
                {/* 1. Font Family */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Phông chữ</span>
                  <select
                    value={currentFont}
                    onChange={(e) => updateCurrentTextBox({ fontFamily: e.target.value })}
                    className="text-xs font-semibold bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 shadow-xs cursor-pointer max-w-[155px]"
                    style={{ fontFamily: getFontFamily(currentFont) }}
                  >
                    <option value="Times New Roman">Times New Roman (Chuẩn VN)</option>
                    <option value="Arial">Arial (Không chân)</option>
                    <option value="Roboto">Roboto (Hiện đại)</option>
                    <option value="Courier New">Courier New (Đơn khoảng)</option>
                  </select>
                </div>

                {/* 2. Font Size + Quick buttons */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Cỡ chữ</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={4}
                      max={120}
                      step={0.5}
                      value={currentSize}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          updateCurrentTextBox({ fontSize: val });
                        }
                      }}
                      className="w-13 text-xs font-bold text-center bg-white border border-gray-300 rounded py-1 outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                    />
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        title="Tăng cỡ chữ"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ fontSize: Math.min(100, currentSize + 1) })}
                        className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        title="Giảm cỡ chữ"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ fontSize: Math.max(4, currentSize - 1) })}
                        className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>

                <div className="w-px h-10 bg-blue-200/80"></div>

                {/* 2b. Độ rộng 2 dòng (Khoảng cách dòng khi xuống dòng) */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Độ rộng 2 dòng</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0.8}
                      max={3.5}
                      step={0.05}
                      value={Math.round(currentLineHeight * 100) / 100}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0.7 && val <= 4) {
                          updateCurrentTextBox({ lineHeight: Math.round(val * 100) / 100 });
                        }
                      }}
                      className="w-12 text-xs font-bold text-center bg-white border border-gray-300 rounded py-1 outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                      title="Khoảng cách giữa 2 dòng khi xuống dòng"
                    />
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        title="Tăng độ rộng 2 dòng"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ lineHeight: Math.min(3.5, Math.round((currentLineHeight + 0.1) * 100) / 100) })}
                        className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        title="Giảm độ rộng 2 dòng"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ lineHeight: Math.max(0.8, Math.round((currentLineHeight - 0.1) * 100) / 100) })}
                        className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded border border-gray-300">
                      {[1.0, 1.25, 1.5, 2.0].map(lhVal => (
                        <button
                          key={lhVal}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => updateCurrentTextBox({ lineHeight: lhVal })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                            Math.abs(currentLineHeight - lhVal) < 0.04
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-gray-700 hover:bg-white'
                          }`}
                        >
                          {lhVal}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedTb && (
                  <>
                    <div className="w-px h-10 bg-blue-200/80"></div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Độ rộng khung</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={20}
                          max={2000}
                          step={5}
                          value={Math.round(selectedTb.width)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 20) {
                              updateCurrentTextBox({ width: val });
                            }
                          }}
                          className="w-14 text-xs font-bold text-center bg-white border border-gray-300 rounded py-1 outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
                          title="Độ rộng ngang của ô chữ (px)"
                        />
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => updateCurrentTextBox({ width: Math.round(selectedTb.width + 10) })}
                            className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => updateCurrentTextBox({ width: Math.max(30, Math.round(selectedTb.width - 10)) })}
                            className="w-5 h-3.5 flex items-center justify-center bg-white hover:bg-blue-100 border border-gray-300 rounded text-[9px] font-bold text-gray-700 cursor-pointer"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="w-px h-10 bg-blue-200/80"></div>

                {/* 3. Bold, Italic, Alignment & Color */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Định dạng & Màu</span>
                    {activeTbSel && selectedTb && (
                      <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold truncate max-w-[130px]">
                        Đoạn: "{selectedTb.text.slice(activeTbSel.start, activeTbSel.end)}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="In đậm (Bold) - Bôi đen từ/cụm từ để in đậm riêng"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => updateCurrentTextBox({ isBold: !currentBold })}
                      className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-xs font-serif font-black cursor-pointer ${
                        currentBold
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs font-bold'
                          : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
                      }`}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      title="In nghiêng (Italic) - Bôi đen từ/cụm từ để in nghiêng riêng"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => updateCurrentTextBox({ isItalic: !currentItalic })}
                      className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-xs font-serif italic font-bold cursor-pointer ${
                        currentItalic
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs font-bold'
                          : 'bg-white hover:bg-gray-100 text-gray-800 border-gray-300'
                      }`}
                    >
                      I
                    </button>

                    {/* Quick color swatches */}
                    <div className="flex items-center gap-1 px-1">
                      {QUICK_TB_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => updateCurrentTextBox({ color: c })}
                          className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                            currentColor.toLowerCase() === c.toLowerCase()
                              ? 'scale-120 border-blue-600 ring-2 ring-blue-300'
                              : 'border-gray-300 hover:scale-110'
                          }`}
                          style={{ backgroundColor: c }}
                          title={`Màu chữ ${c}`}
                        />
                      ))}
                    </div>

                    {/* Alignment */}
                    <div className="flex items-center bg-gray-100 rounded border border-gray-300 p-0.5">
                      <button
                        type="button"
                        title="Căn trái"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ textAlign: 'left' })}
                        className={`p-1 rounded cursor-pointer ${currentAlign === 'left' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Căn giữa"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ textAlign: 'center' })}
                        className={`p-1 rounded cursor-pointer ${currentAlign === 'center' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Căn phải"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => updateCurrentTextBox({ textAlign: 'right' })}
                        className={`p-1 rounded cursor-pointer ${currentAlign === 'right' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Color Picker */}
                    <label
                      className="w-7 h-7 rounded border border-gray-300 flex flex-col items-center justify-center cursor-pointer bg-white overflow-hidden shadow-xs hover:border-blue-400"
                      title="Màu chữ tùy chỉnh"
                    >
                      <span className="text-[11px] font-black leading-none" style={{ color: currentColor }}>A</span>
                      <span className="w-4 h-1 mt-0.5 rounded-full" style={{ backgroundColor: currentColor }}></span>
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => updateCurrentTextBox({ color: e.target.value })}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                <div className="w-px h-10 bg-blue-200/80"></div>

                {/* 4. Background (Nền trắng vs Trong suốt) - CRITICAL REQUIREMENT */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Màu nền ô chữ</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-300">
                    <button
                      type="button"
                      onClick={() => updateCurrentTextBox({ hasBackground: false })}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        !currentHasBg
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nền trong suốt, chữ nổi trực tiếp trên nền tài liệu"
                    >
                      <span className="w-2.5 h-2.5 rounded-xs border border-current bg-transparent inline-block" />
                      <span>Trong suốt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentTextBox({ hasBackground: true })}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentHasBg
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nền màu trắng để che nền cũ hoặc che chữ cũ bên dưới"
                    >
                      <span className="w-2.5 h-2.5 rounded-xs border border-gray-400 bg-white inline-block shadow-2xs" />
                      <span>Nền trắng</span>
                    </button>
                  </div>
                </div>

                <div className="w-px h-10 bg-blue-200/80"></div>

                {/* 5. Border toggle (Không viền vs Có viền) */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-blue-950 uppercase tracking-wider">Khung viền</span>
                  <button
                    type="button"
                    onClick={() => updateCurrentTextBox({ hasBorder: !currentHasBorder })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-semibold transition-all cursor-pointer ${
                      currentHasBorder
                        ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    title={currentHasBorder ? "Bấm để tắt viền ô chữ" : "Bấm để thêm viền bao quanh ô chữ"}
                  >
                    <Square className={`w-3.5 h-3.5 ${currentHasBorder ? 'stroke-[2.5] text-blue-700' : 'text-gray-500'}`} />
                    <span>{currentHasBorder ? 'Có viền' : 'Không viền'}</span>
                  </button>
                </div>

                {/* 6. Actions: Delete / Done */}
                {selectedTb && (
                  <>
                    <div className="w-px h-10 bg-blue-200/80"></div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTextBoxes(prev => prev.filter(t => t.id !== selectedTb.id));
                          setSelectedTextBoxId(null);
                          setEditingTextBoxId(null);
                        }}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Xóa ô chữ này (Phím Delete)"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Xóa ô</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTextBoxId(null);
                          setEditingTextBoxId(null);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Hoàn tất chỉnh sửa ô này"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Xong</span>
                      </button>
                    </div>
                  </>
                )}

                <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-blue-900/60 uppercase tracking-wider font-semibold">Tùy chọn ô chữ (Text Box)</div>
              </div>
            </>
          );
        })()}

        {(activeTool === 'Rectangle' || activeTool === 'Circle' || selectedShapeId !== null) && (() => {
          const selectedSh = shapes.find(s => s.id === selectedShapeId);
          const currentType = selectedSh?.type || shapeType;
          const currentColor = selectedSh?.strokeColor || shapeStrokeColor;
          const currentWidth = selectedSh?.strokeWidth || shapeStrokeWidth;
          const currentStyle = selectedSh?.strokeStyle || shapeStrokeStyle;
          const currentFill = selectedSh?.fillColor || shapeFill;

          const SHAPE_STANDARD_COLORS = [
            { label: 'Đỏ (#EF4444)', color: '#ef4444' },
            { label: 'Xanh dương (#2563EB)', color: '#2563eb' },
            { label: 'Đen (#000000)', color: '#000000' },
            { label: 'Xanh lá (#16A34A)', color: '#16a34a' },
            { label: 'Cam (#F97316)', color: '#f97316' },
            { label: 'Tím (#9333EA)', color: '#9333ea' },
          ];

          const SHAPE_PASTEL_COLORS = [
            { label: 'Hồng Pastel (#F9A8D4)', color: '#f9a8d4' },
            { label: 'Cam Đào Pastel (#FDBA74)', color: '#fdba74' },
            { label: 'Vàng Kem Pastel (#FDE047)', color: '#fde047' },
            { label: 'Xanh Mint Pastel (#86EFAC)', color: '#86efac' },
            { label: 'Ngọc Bích Pastel (#5EEAD4)', color: '#5eead4' },
            { label: 'Xanh Dương Pastel (#93C5FD)', color: '#93c5fd' },
            { label: 'Tím Lavender Pastel (#D8B4FE)', color: '#d8b4fe' },
            { label: 'Xám Khói Pastel (#CBD5E1)', color: '#cbd5e1' },
          ];

          return (
            <>
              <div className="w-px h-15 bg-gray-300 self-center hidden xl:block"></div>

              {/* Shape Formatting Ribbon Group */}
              <div className="flex flex-wrap items-center gap-2 bg-white/95 border border-red-300 rounded-xl px-2.5 py-1.5 min-h-[64px] shadow-xs relative">
                {/* 1. Shape Switcher */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-red-950 uppercase tracking-wider">Hình dạng</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-300">
                    <button
                      type="button"
                      onClick={() => {
                        updateCurrentShape({ type: 'rectangle' });
                        if (activeTool === 'Circle') setActiveTool('Rectangle');
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentType === 'rectangle'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Khung ô vuông hoặc chữ nhật"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Ô vuông</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateCurrentShape({ type: 'circle' });
                        if (activeTool === 'Rectangle') setActiveTool('Circle');
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentType === 'circle'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Khoanh vùng tròn hoặc bầu dục"
                    >
                      <Circle className="w-3.5 h-3.5" />
                      <span>Khoanh tròn</span>
                    </button>
                  </div>
                </div>

                <div className="w-px h-9 bg-red-200/80"></div>

                {/* 2. Quick-Select Color Palette (Standard & Pastel) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold text-red-950 uppercase tracking-wider">
                      Bảng màu viền (Cơ bản & Pastel)
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-gray-100 text-gray-700 border border-gray-300 uppercase"
                        title="Mã màu đang chọn"
                      >
                        {currentColor}
                      </span>
                      {shapes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShapes(prev =>
                              prev.map(s => ({
                                ...s,
                                strokeColor: currentColor,
                                fillColor: currentFill,
                              }))
                            );
                          }}
                          className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors cursor-pointer"
                          title="Đồng bộ màu viền và màu nền hiện tại cho toàn bộ các hình đã vẽ"
                        >
                          Đồng bộ màu
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {/* Standard Colors Row */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-500 font-medium w-9">Đậm:</span>
                      {SHAPE_STANDARD_COLORS.map(c => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => updateCurrentShape({ strokeColor: c.color })}
                          className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                            (currentColor || '').toLowerCase() === c.color.toLowerCase()
                              ? 'border-red-600 scale-120 shadow-xs ring-2 ring-red-300'
                              : 'border-gray-300 hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.color }}
                          title={c.label}
                        />
                      ))}
                      <label
                        className="relative w-4 h-4 rounded-full border border-dashed border-gray-400 overflow-hidden cursor-pointer flex items-center justify-center bg-linear-to-tr from-pink-200 via-yellow-200 to-sky-200 hover:scale-110 transition-transform shadow-2xs"
                        title="Chọn mã màu tùy chỉnh khác"
                      >
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) => updateCurrentShape({ strokeColor: e.target.value })}
                          className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                        />
                      </label>
                    </div>
                    {/* Pastel Colors Row */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-pink-600 font-semibold w-9">Pastel:</span>
                      {SHAPE_PASTEL_COLORS.map(c => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => updateCurrentShape({ strokeColor: c.color })}
                          className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                            (currentColor || '').toLowerCase() === c.color.toLowerCase()
                              ? 'border-red-600 scale-120 shadow-xs ring-2 ring-red-300'
                              : 'border-gray-300 hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.color }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-px h-9 bg-red-200/80"></div>

                {/* 3. Stroke Width */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-red-950 uppercase tracking-wider">Độ dày viền</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 6].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateCurrentShape({ strokeWidth: w })}
                        className={`px-1.5 py-0.5 rounded text-xs font-semibold border transition-all cursor-pointer ${
                          currentWidth === w
                            ? 'bg-red-600 text-white border-red-700 shadow-xs'
                            : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300'
                        }`}
                        title={`${w}px`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <div className="w-px h-9 bg-red-200/80"></div>

                {/* 4. Stroke Style */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-red-950 uppercase tracking-wider">Kiểu viền</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-300">
                    <button
                      type="button"
                      onClick={() => updateCurrentShape({ strokeStyle: 'solid' })}
                      className={`px-1.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentStyle === 'solid'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nét liền"
                    >
                      Nét liền
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentShape({ strokeStyle: 'dashed' })}
                      className={`px-1.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentStyle === 'dashed'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nét đứt"
                    >
                      Nét đứt
                    </button>
                  </div>
                </div>

                <div className="w-px h-9 bg-red-200/80"></div>

                {/* 5. Fill Color */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-red-950 uppercase tracking-wider">Màu nền</span>
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-300">
                    <button
                      type="button"
                      onClick={() => updateCurrentShape({ fillColor: 'transparent' })}
                      className={`px-1.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentFill === 'transparent'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nền trong suốt, nhìn rõ chữ bên dưới"
                    >
                      Trong suốt
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentShape({ fillColor: 'light' })}
                      className={`px-1.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentFill === 'light'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nền mờ nhẹ cùng màu viền"
                    >
                      Mờ nhẹ
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrentShape({ fillColor: 'white' })}
                      className={`px-1.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                        currentFill === 'white'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title="Nền trắng để che nội dung hoặc tạo bảng"
                    >
                      Nền trắng
                    </button>
                  </div>
                </div>

                {/* 6. Actions */}
                {(selectedSh || shapes.length > 0) && (
                  <>
                    <div className="w-px h-9 bg-red-200/80"></div>
                    <div className="flex items-center gap-1.5">
                      {selectedSh && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setShapes(prev => prev.filter(s => s.id !== selectedSh.id));
                              setSelectedShapeId(null);
                            }}
                            className="px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            title="Xóa hình này (Phím Delete)"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span>Xóa hình</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedShapeId(null);
                            }}
                            className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            title="Bỏ chọn hình hiện tại"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Xong</span>
                          </button>
                        </>
                      )}
                      {shapes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShapes([]);
                            setSelectedShapeId(null);
                          }}
                          className="px-2 py-1.5 bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-red-700 border border-gray-200 hover:border-red-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Xóa toàn bộ các ô vuông & khoanh vùng đã vẽ"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Xóa hết ({shapes.length})</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                <div className="absolute -bottom-2 inset-x-0 text-center text-[9px] text-red-950/60 uppercase tracking-wider font-semibold pointer-events-none">Tùy chọn Kẻ ô vuông & Khoanh vùng</div>
              </div>
            </>
          );
        })()}

        {selectedImageId && (() => {
          const selectedImg = images.find(img => img.id === selectedImageId);
          if (!selectedImg) return null;
          return (
            <>
              <div className="w-px h-15 bg-gray-300 self-center"></div>
              <div className="flex items-center gap-2.5 bg-indigo-50/90 px-3 py-1.5 rounded-xl border border-indigo-200 h-[64px] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">Rộng:</span>
                  <input
                    type="number"
                    min={20}
                    max={1200}
                    value={Math.round(selectedImg.width)}
                    onChange={(e) => {
                      const val = Math.max(20, Math.min(1200, Number(e.target.value) || 20));
                      setImages(prev => prev.map(item => item.id === selectedImg.id ? { ...item, width: val } : item));
                    }}
                    className="w-15 px-1.5 py-1 text-xs font-semibold border border-gray-300 rounded bg-white text-center outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">Dài/Cao:</span>
                  <input
                    type="number"
                    min={20}
                    max={1600}
                    value={Math.round(selectedImg.height)}
                    onChange={(e) => {
                      const val = Math.max(20, Math.min(1600, Number(e.target.value) || 20));
                      setImages(prev => prev.map(item => item.id === selectedImg.id ? { ...item, height: val } : item));
                    }}
                    className="w-15 px-1.5 py-1 text-xs font-semibold border border-gray-300 rounded bg-white text-center outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="w-px h-8 bg-indigo-200" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setImages(prev => prev.map(item => {
                        if (item.id !== selectedImg.id) return item;
                        const newW = Math.max(24, Math.round(item.width * 0.9));
                        const newH = Math.max(24, Math.round(item.height * 0.9));
                        return { ...item, width: newW, height: newH };
                      }));
                    }}
                    className="px-2 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-bold cursor-pointer"
                  >
                    Thu nhỏ -
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImages(prev => prev.map(item => {
                        if (item.id !== selectedImg.id) return item;
                        const newW = Math.min(1200, Math.round(item.width * 1.1));
                        const newH = Math.min(1600, Math.round(item.height * 1.1));
                        return { ...item, width: newW, height: newH };
                      }));
                    }}
                    className="px-2 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-bold cursor-pointer"
                  >
                    Phóng to +
                  </button>
                </div>
                <div className="w-px h-8 bg-indigo-200" />
                <button
                  type="button"
                  onClick={() => {
                    setImages(prev => prev.filter(item => item.id !== selectedImg.id));
                    setSelectedImageId(null);
                  }}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>Xóa</span>
                </button>
              </div>
            </>
          );
        })()}
        
        <div className="w-px h-15 bg-gray-300 self-center"></div>

        {/* Help Group */}
        <div className="flex items-start space-x-0.5 relative">
           <RibbonButton 
              icon={HelpCircle} 
              label={"Hướng dẫn\nsử dụng"} 
              active={showHelpModal} 
              onClick={() => setShowHelpModal(true)}
           />
           <div className="absolute -bottom-2 inset-x-0 text-center text-[9px] text-gray-500 uppercase tracking-wider pointer-events-none">Trợ giúp</div>
        </div>

        <div className="w-px h-15 bg-gray-300 self-center"></div>
        
        <div className="flex items-center h-[64px] relative" ref={saveDropdownRef}>
          <button
            type="button"
            onClick={() => setShowSaveDropdown(prev => !prev)}
            className="flex items-center justify-center h-[56px] px-4 rounded-lg shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold border border-emerald-700 transition-colors cursor-pointer gap-2"
            title="Lưu tài liệu PDF"
          >
            <Save className="w-4 h-4" />
            <span className="text-xs font-bold tracking-wide">Lưu</span>
            <ChevronDown className="w-3.5 h-3.5 text-emerald-100" />
          </button>

          {showSaveDropdown && (
            <div className="absolute left-0 top-[60px] w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[100] text-xs">
              <button
                type="button"
                onClick={() => handleDirectSave(false)}
                className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center gap-2 text-gray-800 font-semibold transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Lưu trực tiếp</span>
              </button>
              <div className="border-t border-gray-100" />
              <button
                type="button"
                onClick={() => {
                  setShowSaveDropdown(false);
                  if (!originalPdfBuffer) {
                    alert("Vui lòng nhập tài liệu PDF trước khi lưu.");
                    return;
                  }
                  const baseName = documentName.replace(/\.pdf$/i, '');
                  setExportFilename(`${baseName}_moi.pdf`);
                  setShowExportModal(true);
                }}
                className="w-full px-3 py-2 text-left hover:bg-indigo-50 flex items-center gap-2 text-gray-800 font-semibold transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Lưu 1 bản khác</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Below Ribbon - Document Tabs */}
      <div className="bg-[#f0f0f0] border-b border-gray-300 flex text-xs px-2 pt-1 h-7">
         <div className="bg-white border text-gray-700 border-gray-300 border-b-0 px-4 py-1 rounded-t flex items-center gap-2 relative top-[1px]">
            {documentName} <X className="w-3 h-3 hover:text-red-500 cursor-pointer" />
         </div>
      </div>

      {/* Horizontal Split Layout: Page Thumbnail Sidebar (Left), Canvas (Center), Style Panel (Right) */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Sidebar: Page Thumbnails */}
        {showPageSidebar && (
          <PageThumbnailSidebar
            pages={pages}
            fields={fields}
            currentPage={currentPage}
            selectedPageIndices={selectedPageIndices}
            onSelectPages={(indices, anchor) => {
              setSelectedPageIndices(indices);
              if (anchor !== undefined) setLastSelectedPageIndex(anchor);
            }}
            lastSelectedPageIndex={lastSelectedPageIndex}
            onScrollToPage={handleScrollToPage}
            onDeletePages={handleDeleteMultiplePages}
            onMovePages={handleMoveMultiplePages}
            onRotatePages={handleRotatePages}
            onAddPageClick={() => appendFileInputRef.current?.click()}
            onDropPdfFiles={handleDropPdfFiles}
            onClose={() => setShowPageSidebar(false)}
            isDigitallySigned={isDigitallySigned}
          />
        )}

        {/* Quick Toggle Button when Sidebar is closed */}
        {!showPageSidebar && (
          <button
            type="button"
            onClick={() => setShowPageSidebar(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/95 border border-gray-300 border-l-0 rounded-r-lg shadow-md py-3 px-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 transition-all z-40 flex flex-col items-center gap-1 group cursor-pointer"
            title="Mở bảng trang thu nhỏ"
          >
            <PanelLeft className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 group-hover:text-indigo-700 [writing-mode:vertical-lr]">
              Trang
            </span>
          </button>
        )}

        {/* Floating Indicator for Continuous Mode */}
        {activeTool === 'Signature Field' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-900/95 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md border border-indigo-500/30 animate-bounce z-50">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Đang ở chế độ tạo liên tục trường chữ ký (Nhấn <kbd className="bg-indigo-700 px-1.5 py-0.5 rounded text-[10px] border border-indigo-500 font-mono">ESC</kbd> hoặc nút <b>Chọn</b> để thoát)
            </span>
          </div>
        )}

        {activeTool === 'Text Box' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-900/95 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md border border-blue-500/30 animate-bounce z-50">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <Type className="w-4 h-4 text-blue-300" />
            <span>Nhấn giữ và kéo chuột trên trang để tạo khung thêm chữ (Nhấn <kbd className="bg-blue-700 px-1.5 py-0.5 rounded text-[10px] border border-blue-500 font-mono">ESC</kbd> hoặc nút <b>Chọn</b> để thoát)</span>
          </div>
        )}

        {(activeTool === 'Rectangle' || activeTool === 'Circle') && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/95 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md border border-red-500/30 z-50">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            {activeTool === 'Circle' ? <Circle className="w-4 h-4 text-red-300" /> : <Square className="w-4 h-4 text-red-300" />}
            <span>
              Nhấn giữ và kéo chuột trên trang để {activeTool === 'Circle' ? 'khoanh vùng' : 'kẻ ô vuông'} (Nhấn <kbd className="bg-red-700 px-1.5 py-0.5 rounded text-[10px] border border-red-500 font-mono">ESC</kbd> hoặc nút <b>Chọn</b> để hủy)
            </span>
          </div>
        )}

        {/* Main Workspace */}
        <div 
          ref={workspaceRef}
          className={`flex-1 bg-[#8c8c8c] overflow-auto p-12 flex flex-col gap-6 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] relative transition-colors ${
            isWorkspaceDragOver ? 'ring-4 ring-inset ring-emerald-400 bg-[#7a8b82]' : ''
          }`}
          onScroll={handleScroll}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types || []).includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              if (!isWorkspaceDragOver) setIsWorkspaceDragOver(true);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsWorkspaceDragOver(false);
            }
          }}
          onDrop={handleWorkspaceFileDrop}
        >
        
        {pages.length === 0 ? (
          /* Placeholder Page */
          <div 
             data-page-index={0}
             style={{
               width: 800 * zoom,
               height: 1131 * zoom,
               marginBottom: '28px'
             }}
             className="relative flex-shrink-0 mx-auto"
          >
            <div 
               id="page-0"
               className={`bg-white shadow-xl w-[800px] h-[1131px] relative origin-top-left transition-shadow flex-shrink-0 ${
                 (activeTool === 'Signature Field' || activeTool === 'Highlight' || activeTool === 'Text Box') ? 'cursor-crosshair' : 'cursor-default'
               }`}
               style={{
                 transform: `scale(${zoom})`,
                 transformOrigin: 'top left'
               }}
               onMouseDown={(e) => handleMouseDown(e, 0)}
               onMouseUp={handleMouseUp}
               onMouseLeave={handleMouseUp}
            >
                <div className="absolute top-0 right-0 p-8 text-right opacity-30 select-none pointer-events-none">
                   <h1 className="text-4xl font-bold tracking-widest text-gray-300 mb-2">TÀI LIỆU</h1>
                   <p className="text-lg">TRANG 1 / 1</p>
                </div>

                {/* Instructions Placeholder */}
                <div className="p-20 mt-10 pointer-events-none select-none">
                   <h2 className="text-2xl font-bold mb-4 text-gray-800">Quy trình thiết lập vùng ký số</h2>
                   <p className="text-gray-600 mb-6 max-w-2xl leading-relaxed">
                      Vui lòng tải lên tài liệu PDF để bắt đầu thêm trường chữ ký số. Bạn có thể sử dụng công cụ "Trường chữ ký" để kéo tạo vùng chữ ký mới và sau đó xuất file PDF có chứa vùng chữ ký chuẩn.
                      <br/><br/>
                      <b>Mẹo:</b> Sử dụng nút <b>Nhập PDF</b> trên thanh công cụ ở trên để tải file của bạn lên!
                   </p>
                   <div className="space-y-4">
                       <div className="h-4 bg-gray-200 w-full rounded"></div>
                       <div className="h-4 bg-gray-200 w-5/6 rounded"></div>
                       <div className="h-4 bg-gray-200 w-4/6 rounded"></div>
                   </div>
                </div>

                {renderFields(0)}
                {renderHighlights(0)}
                {renderTextBoxes(0)}
                {renderShapes(0)}
                {renderImages(0)}
                {renderDrawingBox(0)}
            </div>
          </div>
        ) : (
          /* Render Extracted Pages */
          pages.map((p, i) => {
             const isPageSelected = selectedPageIndices.includes(i);
             return (
              <div 
                key={i} 
                data-page-index={i}
                className="flex flex-row items-stretch relative group flex-shrink-0 mx-auto"
                style={{
                  width: p.width * zoom,
                  height: p.height * zoom,
                  marginBottom: '28px'
                }}
              >
                   {/* Page Selection Checkbox */}
                   {!isDigitallySigned && (
                      <div className={`absolute top-4 left-4 z-40 transition-all ${isPageSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                         <input 
                            type="checkbox"
                            checked={isPageSelected}
                            onChange={(e) => {
                               if (e.target.checked) {
                                  setSelectedPageIndices([...selectedPageIndices, i]);
                                  setLastSelectedPageIndex(i);
                               } else {
                                  setSelectedPageIndices(selectedPageIndices.filter(idx => idx !== i));
                               }
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shadow-md cursor-pointer bg-white"
                         />
                      </div>
                   )}

                   {/* Page Controls (shown on hover) */}
                   <div className="absolute -left-12 top-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-40">
                       {!isDigitallySigned ? (
                         <>
                           <button title="Chèn PDF vào trước trang này" onClick={() => { setInsertTargetIndex(i); insertFileInputRef.current?.click(); }} className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-green-600"><FilePlus className="w-4 h-4" /></button>
                           <button title="Xóa trang này" onClick={() => setDeletePageConfirm({index: i, dataUrl: p.dataUrl})} className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                           <button 
                               title="Di chuyển trang lên" 
                               onClick={() => handleMovePage(i, 'up')} 
                               disabled={i === 0}
                               className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-indigo-600 disabled:opacity-30 disabled:pointer-events-none"
                           >
                               <ArrowUp className="w-4 h-4" />
                           </button>
                           <button 
                               title="Di chuyển trang xuống" 
                               onClick={() => handleMovePage(i, 'down')} 
                               disabled={i === pages.length - 1}
                               className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-indigo-600 disabled:opacity-30 disabled:pointer-events-none"
                           >
                               <ArrowDown className="w-4 h-4" />
                           </button>
                         </>
                       ) : (
                         <div className="bg-amber-100 border border-amber-300 text-amber-800 text-[10px] px-1.5 py-1 rounded shadow-sm whitespace-nowrap">Đã khóa</div>
                       )}
                   </div>

                   <div 
                     id={`page-${i}`}
                     className={`bg-white shadow-xl relative origin-top-left transition-shadow duration-150 flex-shrink-0 ${
                       (activeTool === 'Signature Field' || activeTool === 'Highlight' || activeTool === 'Text Box' || activeTool === 'Rectangle' || activeTool === 'Circle') ? 'cursor-crosshair' : 'cursor-default'
                     } ${isPageSelected ? 'ring-4 ring-indigo-500 ring-offset-2 z-20' : ''}`}
                     style={{ 
                       width: p.width, 
                       height: p.height,
                       transform: `scale(${zoom})`,
                       transformOrigin: 'top left'
                     }}
                     onMouseDown={(e) => handleMouseDown(e, i)}
                   >
                      <img src={p.dataUrl} className="w-full h-full pointer-events-none select-none" alt={`Trang ${i+1}`} />
                      {renderFields(i)}
                      {renderHighlights(i)}
                      {renderTextBoxes(i)}
                      {renderShapes(i)}
                      {renderImages(i)}
                      {activeTool === 'Edit Text' && renderOriginalTexts(i)}
                      {renderModifiedTextsOverlay(i)}
                      {renderDrawingBox(i)}
                   </div>
              </div>
             );
          })
        )}

        {/* Centered Floating Page Indicator */}
        {pages.length > 0 && (
           <div 
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0f205c]/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-2xl z-30 flex items-center gap-4 border border-[#2b3c7c]/80 transition-all duration-200"
           >
              <button 
                  onClick={() => {
                     const target = currentPage - 1;
                     if (target >= 1) handleScrollToPage(target - 1);
                  }}
                  disabled={currentPage <= 1}
                  className="hover:text-blue-300 disabled:opacity-30 disabled:hover:text-white transition-colors cursor-pointer"
                  aria-label="Trang trước"
              >
                 <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs font-bold select-none whitespace-nowrap">Trang {currentPage} / {pages.length}</span>
              <button 
                  onClick={() => {
                     const target = currentPage + 1;
                     if (target <= pages.length) handleScrollToPage(target - 1);
                  }}
                  disabled={currentPage >= pages.length}
                  className="hover:text-blue-300 disabled:opacity-30 disabled:hover:text-white transition-colors cursor-pointer"
                  aria-label="Trang sau"
              >
                 <ChevronRight className="w-5 h-5" />
              </button>
           </div>
        )}

        {/* Floating Action Bar for Multi-Page Management */}
        {selectedPageIndices.length > 0 && (
           <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-gray-200 text-gray-800 px-6 py-2.5 rounded-2xl shadow-2xl z-30 flex items-center gap-4 border-indigo-100 animate-fade-in">
              <div className="flex items-center gap-2">
                 <div className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">
                    {selectedPageIndices.length}
                 </div>
                 <span className="text-xs font-semibold text-gray-700">trang đã chọn</span>
              </div>
              
              <div className="h-5 w-px bg-gray-200" />
              
              <div className="flex items-center gap-1.5">
                 <span className="text-xs text-gray-500 font-medium">Chuyển trước:</span>
                 <select 
                    onChange={(e) => {
                       const targetVal = parseInt(e.target.value);
                       if (!isNaN(targetVal)) {
                          handleMoveMultiplePages(selectedPageIndices, targetVal);
                       }
                    }}
                    value=""
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 px-2 py-1 cursor-pointer font-medium"
                 >
                    <option value="" disabled>Chọn đích...</option>
                    {pages
                       .map((_, idx) => idx)
                       .filter(idx => !selectedPageIndices.includes(idx))
                       .map(idx => (
                          <option key={`page-dest-${idx}`} value={idx}>Trang {idx + 1}</option>
                       ))}
                    {!selectedPageIndices.includes(pages.length) && (
                       <option key="page-dest-end" value={pages.length}>Cuối tài liệu</option>
                    )}
                 </select>
              </div>

              <div className="h-5 w-px bg-gray-200" />

              <button 
                 onClick={() => handleDeleteMultiplePages(selectedPageIndices)}
                 disabled={isDigitallySigned}
                 className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                 <Trash2 className="w-3.5 h-3.5" />
                 Xóa
              </button>

              <button 
                 onClick={() => setSelectedPageIndices([])}
                 className="text-xs text-gray-500 hover:text-gray-700 font-medium hover:underline cursor-pointer"
              >
                 Hủy
              </button>
           </div>
         )}

        {/* Floating Zoom Controls Bar at Bottom Right */}
        <ZoomControls
           zoom={zoom}
           onZoomChange={applyZoomWithCenterAnchor}
           onFitWidth={handleFitWidth}
           onFitPage={handleFitPage}
           onResetZoom={handleResetZoom}
           className="fixed bottom-6 z-30"
           style={{ right: '24px' }}
        />

        {/* Direct Save Toast Notification (matching native desktop-like feedback) */}
        {saveToast && (
          <div className="fixed bottom-20 right-6 z-50 bg-[#182232] text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700/80 flex items-center gap-3.5 min-w-[290px] max-w-md animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Save className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs font-bold text-white truncate">{saveToast.title}</span>
              <span className="text-[11px] text-slate-300 mt-0.5">{saveToast.subtitle}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              aria-label="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        </div>
      </div>
    </div>
  );

  function renderHighlights(pageIndex: number) {
    return highlights
      .filter(h => h.pageIndex === pageIndex)
      .map(h => {
        const isSelected = h.id === selectedHighlightId;
        const isWhiteout = !!h.isWhiteout;

        return (
          <div
            key={h.id}
            id={`highlight-${h.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedHighlightId(h.id);
              setSelectedFieldId(null);
              setSelectedTextId(null);
            }}
            onMouseDown={(e) => {
              if (isDigitallySigned) return;
              e.stopPropagation();
              setSelectedHighlightId(h.id);
              setSelectedFieldId(null);
              setSelectedTextId(null);
              const pageElement = document.getElementById(`page-${pageIndex}`);
              if (pageElement) {
                const rect = pageElement.getBoundingClientRect();
                const startX = (e.clientX - rect.left) / zoom;
                const startY = (e.clientY - rect.top) / zoom;
                setHighlightInteraction({
                  id: h.id,
                  type: 'drag',
                  startX,
                  startY,
                  originalX: h.x,
                  originalY: h.y,
                  originalWidth: h.width,
                  originalHeight: h.height,
                  pageIndex,
                });
              }
            }}
            className={`absolute group cursor-pointer transition-shadow z-25 rounded-xs select-none ${
              isWhiteout
                ? isSelected
                  ? 'ring-2 ring-blue-600 border border-blue-400 shadow-md'
                  : 'hover:ring-1 hover:ring-blue-400 border border-dashed border-blue-300'
                : isSelected
                ? 'ring-2 ring-amber-500 ring-offset-1 shadow-md'
                : 'hover:ring-1 hover:ring-amber-400'
            }`}
            style={{
              left: h.x,
              top: h.y,
              width: h.width,
              height: h.height,
              backgroundColor: isWhiteout ? '#ffffff' : h.color,
              opacity: isWhiteout ? 1 : (h.opacity || 0.45),
              mixBlendMode: isWhiteout ? 'normal' : 'multiply',
            }}
            title={isWhiteout ? "Vùng tẩy vết màu cũ (Nhấn Delete hoặc nút X đỏ để xóa)" : "Khung tô sáng (Click để chọn, phím Delete hoặc nút X để xóa)"}
          >
            {/* Whiteout background and crisp original text */}
            {isWhiteout && (
              <div className="absolute inset-0 bg-white overflow-hidden pointer-events-none select-none">
                {pdfTexts
                  .filter(t => t.pageIndex === pageIndex && !t.isModified &&
                    t.x + t.width >= h.x - 2 && t.x <= h.x + h.width + 2 &&
                    t.y + t.height >= h.y - 2 && t.y <= h.y + h.height + 2
                  )
                  .map(t => {
                    const sizeToUse = (t.customFontSize || t.fontSize) * 1.5;
                    const fontNameLower = (t.customFontFamily || t.fontName || '').toLowerCase();
                    const isSans = fontNameLower.includes('sans') || fontNameLower.includes('arial') || fontNameLower.includes('roboto') || fontNameLower.includes('helvetica');
                    const fontFamily = isSans ? 'Arial, Helvetica, sans-serif' : '"Times New Roman", Times, serif';
                    return (
                      <div
                        key={`wh-text-${t.id}`}
                        style={{
                          position: 'absolute',
                          left: t.x - h.x,
                          top: t.y - h.y,
                          fontSize: `${sizeToUse}px`,
                          fontFamily: fontFamily,
                          fontWeight: t.isBold ? 700 : 400,
                          fontStyle: t.isItalic ? 'italic' : 'normal',
                          color: t.customColor || '#000000',
                          lineHeight: 1.15,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.text}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Small badge for whiteout when selected */}
            {isWhiteout && isSelected && (
              <div className="absolute -top-5 left-0 flex items-center gap-1 bg-blue-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap z-40">
                <Eraser className="w-2.5 h-2.5" /> Đã tẩy vết màu cũ
              </div>
            )}

            {/* Resizing handle on right edge */}
            {isSelected && !isDigitallySigned && (
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const pageElement = document.getElementById(`page-${pageIndex}`);
                  if (pageElement) {
                    const rect = pageElement.getBoundingClientRect();
                    const startX = (e.clientX - rect.left) / zoom;
                    const startY = (e.clientY - rect.top) / zoom;
                    setHighlightInteraction({
                      id: h.id,
                      type: 'e',
                      startX,
                      startY,
                      originalX: h.x,
                      originalY: h.y,
                      originalWidth: h.width,
                      originalHeight: h.height,
                      pageIndex,
                    });
                  }
                }}
                className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-r-xs z-35 ${
                  isWhiteout ? 'bg-blue-500/80 hover:bg-blue-600' : 'bg-amber-500/80 hover:bg-amber-600'
                }`}
                title="Kéo mép phải để chỉnh độ rộng khung"
              />
            )}

            {/* Resizing handle on bottom-right corner */}
            {isSelected && !isDigitallySigned && (
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const pageElement = document.getElementById(`page-${pageIndex}`);
                  if (pageElement) {
                    const rect = pageElement.getBoundingClientRect();
                    const startX = (e.clientX - rect.left) / zoom;
                    const startY = (e.clientY - rect.top) / zoom;
                    setHighlightInteraction({
                      id: h.id,
                      type: 'se',
                      startX,
                      startY,
                      originalX: h.x,
                      originalY: h.y,
                      originalWidth: h.width,
                      originalHeight: h.height,
                      pageIndex,
                    });
                  }
                }}
                className={`absolute right-0 bottom-0 w-3 h-3 cursor-se-resize rounded-br-xs z-35 ${
                  isWhiteout ? 'bg-blue-600' : 'bg-amber-600'
                }`}
                title="Kéo góc để chỉnh kích thước"
              />
            )}

            {/* Quick floating delete button */}
            {!isDigitallySigned && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHighlights(prev => prev.filter(item => item.id !== h.id));
                  if (selectedHighlightId === h.id) setSelectedHighlightId(null);
                }}
                className={`absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-lg transition-all z-40 cursor-pointer ${
                  isSelected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-90 hover:scale-100'
                }`}
                title="Xóa khung này"
              >
                <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        );
      });
  }

  function renderTextBoxes(pageIndex: number) {
    return textBoxes
      .filter(tb => tb.pageIndex === pageIndex)
      .map(tb => {
        const isSelected = tb.id === selectedTextBoxId;
        const isEditing = tb.id === editingTextBoxId;
        const fontFamilyCss = getFontFamily(tb.fontFamily || 'Times New Roman');

        const activeTbSpans = getNormalizedTextBoxSpans(tb);
        const hasMultipleTbSpans = activeTbSpans.length > 1;
        const primaryTbSpan = activeTbSpans[0];

        return (
          <div
            key={tb.id}
            id={`textbox-${tb.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTextBoxId(tb.id);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextId(null);
              setTbFontFamily(tb.fontFamily || 'Times New Roman');
              setTbFontSize(tb.fontSize || 12);
              setTbLineHeight(tb.lineHeight || 1.25);
              setTbIsBold(!!tb.isBold);
              setTbIsItalic(!!tb.isItalic);
              setTbColor(tb.color || '#000000');
              setTbTextAlign(tb.textAlign || 'left');
              setTbHasBackground(!!tb.hasBackground);
              setTbHasBorder(!!tb.hasBorder);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setSelectedTextBoxId(tb.id);
              setEditingTextBoxId(tb.id);
            }}
            onMouseDown={(e) => {
              if (isEditing || isDigitallySigned) return;
              e.stopPropagation();
              setSelectedTextBoxId(tb.id);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextId(null);
              handleTextBoxResizeDown(e, tb, 'drag');
            }}
            className={`absolute group select-none transition-shadow ${
              isEditing ? 'cursor-text z-50' : 'cursor-move z-30'
            } ${
              tb.hasBackground ? 'bg-white' : 'bg-transparent'
            } ${
              tb.hasBorder
                ? 'border border-gray-900'
                : isSelected
                ? 'border border-dashed border-blue-500'
                : 'hover:border hover:border-dashed hover:border-blue-400 border border-transparent'
            } ${
              isSelected ? 'ring-2 ring-blue-500 shadow-md ring-offset-1' : ''
            }`}
            style={{
              left: tb.x,
              top: tb.y,
              width: tb.width,
              height: tb.height,
            }}
            title="Ô chữ (Nhấp đúp để gõ chữ, bôi đen từng từ để chỉnh trên thanh công cụ)"
          >
            {/* Editing mode: In-place Textarea without extra popup frames */}
            {isEditing ? (
              <div className="relative w-full h-full">
                {hasMultipleTbSpans && (
                  <div
                    className="absolute inset-0 p-1 pointer-events-none select-none overflow-hidden whitespace-pre-wrap break-words"
                    style={{
                      fontFamily: fontFamilyCss,
                      fontSize: `${(tb.fontSize || 12) * 1.5}px`,
                      lineHeight: tb.lineHeight || 1.25,
                      fontWeight: tb.isBold ? 700 : 400,
                      fontStyle: tb.isItalic ? 'italic' : 'normal',
                      color: tb.color || '#000000',
                      textAlign: tb.textAlign || 'left',
                    }}
                  >
                    {activeTbSpans.map((seg, sIdx) => (
                      <span
                        key={sIdx}
                        style={{
                          fontFamily: getFontFamily(seg.fontFamily || tb.fontFamily || 'Times New Roman'),
                          fontSize: `${(seg.fontSize || tb.fontSize || 12) * 1.5}px`,
                          fontWeight: (seg.isBold ?? tb.isBold) ? 700 : 400,
                          fontStyle: (seg.isItalic ?? tb.isItalic) ? 'italic' : 'normal',
                          color: seg.color || tb.color || '#000000',
                        }}
                      >
                        {seg.text}
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  id={`tb-textarea-${tb.id}`}
                  autoFocus
                  value={tb.text}
                  onChange={(e) => {
                    updateCurrentTextBox({ text: e.target.value });
                  }}
                  onSelect={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setTbSelectionRange({ id: tb.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setTbSelectionRange(null);
                    }
                  }}
                  onMouseUp={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setTbSelectionRange({ id: tb.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setTbSelectionRange(null);
                    }
                  }}
                  onKeyUp={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setTbSelectionRange({ id: tb.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setTbSelectionRange(null);
                    }
                  }}
                  onBlur={(e) => {
                    const related = e.relatedTarget as HTMLElement | null;
                    if (related && related.closest('#textbox-ribbon-bar')) {
                      return;
                    }
                    setEditingTextBoxId(null);
                    setTbSelectionRange(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`relative z-10 w-full h-full p-1 bg-transparent resize-none outline-none border-none overflow-hidden focus:ring-0 select-text ${
                    hasMultipleTbSpans ? 'selection:bg-blue-500/25 selection:text-transparent' : ''
                  }`}
                  style={{
                    fontFamily: getFontFamily(primaryTbSpan?.fontFamily || tb.fontFamily || 'Times New Roman'),
                    fontSize: `${(primaryTbSpan?.fontSize || tb.fontSize || 12) * 1.5}px`,
                    lineHeight: tb.lineHeight || 1.25,
                    fontWeight: (primaryTbSpan?.isBold ?? tb.isBold) ? 700 : 400,
                    fontStyle: (primaryTbSpan?.isItalic ?? tb.isItalic) ? 'italic' : 'normal',
                    color: hasMultipleTbSpans ? 'transparent' : (primaryTbSpan?.color || tb.color || '#000000'),
                    caretColor: '#000000',
                    textAlign: tb.textAlign || 'left',
                  }}
                  placeholder="Nhập nội dung chữ..."
                />
              </div>
            ) : (
              /* Display mode with per-span rich-text styles */
              <div 
                className="w-full h-full p-1 overflow-hidden whitespace-pre-wrap break-words"
                style={{
                  fontFamily: fontFamilyCss,
                  fontSize: `${(tb.fontSize || 12) * 1.5}px`,
                  lineHeight: tb.lineHeight || 1.25,
                  fontWeight: tb.isBold ? 700 : 400,
                  fontStyle: tb.isItalic ? 'italic' : 'normal',
                  color: tb.color || '#000000',
                  textAlign: tb.textAlign || 'left',
                }}
              >
                {tb.text ? (
                  activeTbSpans.map((seg, sIdx) => (
                    <span
                      key={sIdx}
                      style={{
                        fontFamily: getFontFamily(seg.fontFamily || tb.fontFamily || 'Times New Roman'),
                        fontSize: `${(seg.fontSize || tb.fontSize || 12) * 1.5}px`,
                        fontWeight: (seg.isBold ?? tb.isBold) ? 700 : 400,
                        fontStyle: (seg.isItalic ?? tb.isItalic) ? 'italic' : 'normal',
                        color: seg.color || tb.color || '#000000',
                      }}
                    >
                      {seg.text}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-xs select-none">
                    Nhấp đúp để nhập chữ...
                  </span>
                )}
              </div>
            )}

            {/* Selection indicators & 8 Resize Handles */}
            {isSelected && !isEditing && !isDigitallySigned && (
              <>
                {/* Top-left handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nwse-resize z-40 shadow-xs"
                  title="Kéo chỉnh góc trên trái"
                />
                {/* Top-middle handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-ns-resize z-40 shadow-xs"
                  title="Kéo chỉnh cạnh trên"
                />
                {/* Top-right handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nesw-resize z-40 shadow-xs"
                  title="Kéo chỉnh góc trên phải"
                />
                {/* Right-middle handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'e')}
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-ew-resize z-40 shadow-xs"
                  title="Kéo chỉnh cạnh phải"
                />
                {/* Bottom-right handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nwse-resize z-40 shadow-xs"
                  title="Kéo chỉnh góc dưới phải"
                />
                {/* Bottom-middle handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-ns-resize z-40 shadow-xs"
                  title="Kéo chỉnh cạnh dưới"
                />
                {/* Bottom-left handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-nesw-resize z-40 shadow-xs"
                  title="Kéo chỉnh góc dưới trái"
                />
                {/* Left-middle handle */}
                <div
                  onMouseDown={(e) => handleTextBoxResizeDown(e, tb, 'w')}
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-ew-resize z-40 shadow-xs"
                  title="Kéo chỉnh cạnh trái"
                />

                {/* Quick Delete Floating Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (initialLoadedTextBoxesRef.current.some(itb => itb.id === tb.id)) {
                      setDeletedTextBoxes(prev => [...prev, tb]);
                    }
                    setTextBoxes(prev => prev.filter(t => t.id !== tb.id));
                    setSelectedTextBoxId(null);
                    setEditingTextBoxId(null);
                  }}
                  className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-all z-50 cursor-pointer"
                  title="Xóa ô chữ này (Phím Delete)"
                >
                  <Trash2 className="w-3 h-3 stroke-[2.5]" />
                </button>
              </>
            )}
          </div>
        );
      });
  }

  function renderFields(pageIndex: number) {
     return fields.filter(f => f.pageIndex === pageIndex).map(f => {
         const isSelected = f.id === selectedFieldId;
         const isText = f.type === 'text';
         
         const bgClass = isText 
           ? 'bg-blue-50/90 border-blue-500 hover:bg-blue-100/90' 
           : 'bg-indigo-50/90 border-indigo-500 hover:bg-indigo-100/90';
           
         const borderClass = isSelected 
           ? (isText ? 'border-2 border-blue-600 z-50 shadow-md' : 'border-2 border-indigo-600 z-50 shadow-md') 
           : (isText ? 'border border-dashed border-blue-400 hover:border-blue-600' : 'border border-dashed border-indigo-400 hover:border-indigo-600');
           
         const activeColorClass = isText ? 'bg-blue-600' : 'bg-indigo-600';
         const focusRingClass = isText ? 'focus:border-blue-500 focus:ring-blue-500' : 'focus:border-indigo-500 focus:ring-indigo-500';

         return (
         <div 
           key={f.id}
           className={`absolute group ${borderClass} ${bgClass} ${activeTool === 'Select' ? 'cursor-move' : 'cursor-pointer'} rounded transition-all duration-150`}
           style={{ left: f.x, top: f.y, width: f.width, height: f.height }}
           onMouseDown={(e) => {
              if (isDigitallySigned) return;
              e.stopPropagation();
              setSelectedFieldId(f.id);
              if (activeTool === 'Select') {
                const pageElement = (e.currentTarget as HTMLElement).closest('[id^="page-"]') as HTMLDivElement;
                if (pageElement) {
                    const rect = pageElement.getBoundingClientRect();
                    const startX = (e.clientX - rect.left) / zoom;
                    const startY = (e.clientY - rect.top) / zoom;
                    setFieldInteraction({
                        id: f.id,
                        type: 'drag',
                        startX,
                        startY,
                        originalX: f.x,
                        originalY: f.y,
                        originalWidth: f.width,
                        originalHeight: f.height,
                        pageIndex: f.pageIndex
                    });
                }
              }
           }}
         >
             {/* Content Icon & Text */}
             <div className={`absolute inset-0 flex flex-col items-center justify-center p-1 text-center gap-0.5 ${isSelected ? '' : 'pointer-events-none select-none'}`}>
                 {isText ? (
                     <>
                         <Type className="w-4 h-4 text-blue-600 pointer-events-none" />
                         {isSelected ? (
                             <input 
                                 type="text" 
                                 value={f.name} 
                                 autoFocus
                                 onFocus={(e) => e.target.select()}
                                 onChange={(e) => {
                                   setFields(fields.map(field => field.id === f.id ? { ...field, name: e.target.value } : field));
                                 }}
                                 onMouseDown={(e) => e.stopPropagation()}
                                 onClick={(e) => e.stopPropagation()}
                                 className="text-[10px] font-bold text-blue-700 text-center bg-white border border-blue-300 rounded px-1 py-0.5 w-full outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                             />
                         ) : (
                             <span className="text-[10px] font-bold text-blue-700 leading-none truncate max-w-full">
                                 {f.textValue || f.name}
                             </span>
                         )}
                     </>
                 ) : (
                     <>
                         {isSelected ? (
                             <input 
                                 type="text" 
                                 value={f.name} 
                                 autoFocus
                                 onFocus={(e) => e.target.select()}
                                 onChange={(e) => {
                                   setFields(fields.map(field => field.id === f.id ? { ...field, name: e.target.value } : field));
                                 }}
                                 onMouseDown={(e) => e.stopPropagation()}
                                 onClick={(e) => e.stopPropagation()}
                                 className="text-xs sm:text-sm font-semibold text-indigo-800 text-center bg-white/90 border border-indigo-300 rounded px-2 py-0.5 max-w-[90%] outline-none focus:ring-1 focus:ring-indigo-500 font-sans shadow-sm"
                             />
                         ) : (
                             <span className="text-xs sm:text-sm font-semibold text-indigo-800 leading-tight truncate max-w-full px-1">{f.name}</span>
                         )}
                     </>
                 )}
             </div>
             
             {/* Corner Handles for resizing */}
             {isSelected && activeTool === 'Select' && !isDigitallySigned && (
                 <>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'nw')} className={`absolute top-0 left-0 w-1.5 h-1.5 ${activeColorClass} transform -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border border-white rounded-full z-10`}></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'n')} className={`absolute top-0 left-1/2 w-1.5 h-1.5 ${activeColorClass} transform -translate-x-1/2 -translate-y-1/2 cursor-ns-resize border border-white rounded-full z-10`}></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'ne')} className={`absolute top-0 right-0 w-1.5 h-1.5 ${activeColorClass} transform translate-x-1/2 -translate-y-1/2 cursor-nesw-resize border border-white rounded-full z-10`}></div>
                     
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'w')} className={`absolute top-1/2 left-0 w-1.5 h-1.5 ${activeColorClass} transform -translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-white rounded-full z-10`}></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'e')} className={`absolute top-1/2 right-0 w-1.5 h-1.5 ${activeColorClass} transform translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-white rounded-full z-10`}></div>
                     
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'sw')} className={`absolute bottom-0 left-0 w-1.5 h-1.5 ${activeColorClass} transform -translate-x-1/2 translate-y-1/2 cursor-nesw-resize border border-white rounded-full z-10`}></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 's')} className={`absolute bottom-0 left-1/2 w-1.5 h-1.5 ${activeColorClass} transform -translate-x-1/2 translate-y-1/2 cursor-ns-resize border border-white rounded-full z-10`}></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'se')} className={`absolute bottom-0 right-0 w-1.5 h-1.5 ${activeColorClass} transform translate-x-1/2 translate-y-1/2 cursor-nwse-resize border border-white rounded-full z-10`}></div>
                 </>
             )}

             {/* Delete Action Button */}
             {!isDigitallySigned && (
               <button 
                 onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
                 className="absolute -top-2 -right-2 bg-white text-red-600 border border-red-200 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-700 cursor-pointer shadow z-20 transition-all duration-150"
                 title={isText ? "Xóa trường văn bản" : "Xóa trường chữ ký"}
               >
                   <X className="w-3 h-3 stroke-[2.5]" />
               </button>
             )}
             
             {/* Properties Popup Wrapper - chỉ hiển thị cho trường văn bản */}
             {isSelected && activeTool === 'Select' && isText && !isDigitallySigned && (
                 <div className="absolute left-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-md p-2.5 shadow-lg z-50 text-[11px] font-sans text-gray-800 cursor-default w-[220px]"
                  onMouseDown={(e) => e.stopPropagation()}
                 >
                     <div className="flex flex-col gap-2">
                         <div className="flex flex-col gap-1">
                             <span className="font-semibold text-gray-700">Tên trường văn bản:</span>
                             <input 
                                type="text" 
                                value={f.name} 
                                onChange={(e) => {
                                  setFields(fields.map(field => field.id === f.id ? { ...field, name: e.target.value } : field));
                                }}
                                className={`w-full border border-gray-300 rounded px-2 py-1 outline-none bg-white ${focusRingClass}`}
                             />
                         </div>
                         <div className="flex flex-col gap-1">
                             <span className="font-semibold text-gray-700">Nội dung chữ hiển thị:</span>
                             <textarea 
                                value={f.textValue || ''} 
                                placeholder="Nhập nội dung văn bản..."
                                onChange={(e) => {
                                  setFields(fields.map(field => field.id === f.id ? { ...field, textValue: e.target.value } : field));
                                }}
                                rows={2}
                                className={`w-full border border-gray-300 rounded px-2 py-1 outline-none bg-white ${focusRingClass} resize-none`}
                             />
                         </div>
                         <div className="flex gap-2">
                             <div className="flex-1 flex flex-col gap-1">
                                 <span className="font-semibold text-gray-700">Cỡ chữ (px):</span>
                                 <input 
                                    type="number" 
                                    value={f.fontSize || 12} 
                                    onChange={(e) => {
                                      const size = parseInt(e.target.value) || 12;
                                      setFields(fields.map(field => field.id === f.id ? { ...field, fontSize: size } : field));
                                    }}
                                    className={`w-full border border-gray-300 rounded px-2 py-1 outline-none bg-white ${focusRingClass}`}
                                 />
                             </div>
                         </div>
                     </div>
                 </div>
             )}
         </div>
     )});
  }

  function renderDrawingBox(pageIndex: number) {
     if (!drawing || drawing.pageIndex !== pageIndex) return null;
     if (activeTool === 'Rectangle' || activeTool === 'Circle') {
       const drawW = Math.abs(drawing.currentX - drawing.startX);
       const drawH = Math.abs(drawing.currentY - drawing.startY);
       if (drawW < 8 && drawH < 8) return null;
       const isCircle = activeTool === 'Circle';
       const borderStyleVal = shapeStrokeStyle === 'dashed' ? 'dashed' : shapeStrokeStyle === 'dotted' ? 'dotted' : 'solid';
       let bgStyle: React.CSSProperties = {};
       if (shapeFill === 'white') {
         bgStyle.backgroundColor = '#ffffff';
       } else if (shapeFill === 'light') {
         bgStyle.backgroundColor = `${shapeStrokeColor}26`;
       } else {
         bgStyle.backgroundColor = 'transparent';
       }

       return (
         <div 
           className={`absolute pointer-events-none z-30 transition-none ${
             isCircle ? 'rounded-[50%]' : 'rounded-none'
           }`}
           style={{ 
             left: Math.min(drawing.startX, drawing.currentX), 
             top: Math.min(drawing.startY, drawing.currentY), 
             width: drawW, 
             height: drawH,
             borderWidth: `${shapeStrokeWidth}px`,
             borderColor: shapeStrokeColor,
             borderStyle: borderStyleVal,
             ...bgStyle,
           }}
         >
           <div 
             className="absolute top-0 left-0 text-white text-[10px] font-bold px-1.5 py-0.5 whitespace-nowrap transform -translate-y-[calc(100%+2px)] leading-none rounded-t shadow-xs flex items-center gap-1"
             style={{ backgroundColor: shapeStrokeColor }}
           >
             {isCircle ? 'Khoanh vùng (Tròn/Elip)' : 'Kẻ ô vuông / Chữ nhật'}
           </div>
         </div>
       );
     }
     if (activeTool === 'Highlight') {
       const isEraser = highlightToolMode === 'eraser';
       return (
         <div 
            className={`absolute border-2 border-dashed rounded-xs z-30 pointer-events-none ${
              isEraser ? 'border-blue-600 bg-white/80' : 'border-amber-500'
            }`}
            style={{ 
                left: Math.min(drawing.startX, drawing.currentX), 
                top: Math.min(drawing.startY, drawing.currentY), 
                width: Math.abs(drawing.currentX - drawing.startX), 
                height: Math.abs(drawing.currentY - drawing.startY),
                backgroundColor: isEraser ? '#ffffff' : highlightColor,
                opacity: isEraser ? 0.95 : highlightOpacity,
                mixBlendMode: isEraser ? 'normal' : 'multiply'
            }}
         >
            <div className={`absolute top-0 left-0 text-white text-[10px] font-bold px-1.5 py-0.5 whitespace-nowrap transform -translate-y-[calc(100%+1px)] -translate-x-[1px] leading-none rounded-t shadow-xs flex items-center gap-1 ${
              isEraser ? 'bg-blue-600' : 'bg-amber-500'
            }`}>
              {isEraser ? 'Tẩy vết màu cũ (Khôi phục nền trắng)' : 'Tô sáng (Highlight)'}
            </div>
         </div>
       );
     }
     const borderClass = 'border-indigo-600 bg-indigo-50';
     const labelBg = 'bg-indigo-600';
     const label = 'Trường chữ ký';
     return (
        <div 
           className={`absolute border border-dashed bg-opacity-40 ${borderClass}`}
           style={{ 
               left: Math.min(drawing.startX, drawing.currentX), 
               top: Math.min(drawing.startY, drawing.currentY), 
               width: Math.abs(drawing.currentX - drawing.startX), 
               height: Math.abs(drawing.currentY - drawing.startY) 
           }}
        >
              {/* Tab Header Preview */}
              <div className={`absolute top-0 left-0 ${labelBg} text-white text-[10px] px-1.5 py-0.5 whitespace-nowrap transform -translate-y-[calc(100%+1px)] -translate-x-[1px] leading-none rounded-t`}>
                  {label}
              </div>
        </div>
     );
  }

  function renderShapes(pageIndex: number) {
    return shapes
      .filter(s => s.pageIndex === pageIndex)
      .map(s => {
        const isSelected = s.id === selectedShapeId;
        const isCircle = s.type === 'circle';

        let bgStyle: React.CSSProperties = {};
        if (s.fillColor === 'white') {
          bgStyle.backgroundColor = '#ffffff';
        } else if (s.fillColor === 'light') {
          bgStyle.backgroundColor = `${s.strokeColor}26`;
        } else {
          bgStyle.backgroundColor = 'transparent';
        }

        const borderStyleVal = s.strokeStyle === 'dashed' ? 'dashed' : s.strokeStyle === 'dotted' ? 'dotted' : 'solid';

        return (
          <div
            key={s.id}
            id={`shape-${s.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedShapeId(s.id);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextBoxId(null);
              setSelectedTextId(null);
            }}
            onMouseDown={(e) => {
              if (isDigitallySigned) return;
              e.stopPropagation();
              setSelectedShapeId(s.id);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextBoxId(null);
              setSelectedTextId(null);
              handleShapeResizeDown(e, s, 'drag');
            }}
            className={`absolute group select-none transition-shadow z-25 cursor-move ${
              isCircle ? 'rounded-[50%]' : 'rounded-none'
            } ${
              isSelected ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md' : 'hover:ring-1 hover:ring-blue-400/60'
            }`}
            style={{
              left: s.x,
              top: s.y,
              width: s.width,
              height: s.height,
              borderWidth: `${s.strokeWidth}px`,
              borderColor: s.strokeColor,
              borderStyle: borderStyleVal,
              ...bgStyle,
            }}
            title={isCircle ? "Khoanh vùng tròn / elip (Kéo để di chuyển, kéo các điểm neo để chỉnh kích thước)" : "Khung chữ nhật / ô vuông (Kéo để di chuyển, kéo các điểm neo để chỉnh kích thước)"}
          >
            {/* 8 Resize Handles when selected */}
            {isSelected && !isDigitallySigned && (
              <>
                {/* 4 Corners */}
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-nw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-ne-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-se-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-sw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />

                {/* 4 Edges */}
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-n-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-s-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'w')}
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-w-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleShapeResizeDown(e, s, 'e')}
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-e-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />

                {/* Quick Floating Delete Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShapes(prev => prev.filter(item => item.id !== s.id));
                    setSelectedShapeId(null);
                  }}
                  className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer"
                  title="Xóa hình này (Phím Delete)"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </>
            )}
          </div>
        );
      });
  }

  function renderImages(pageIndex: number) {
    return images
      .filter(img => img.pageIndex === pageIndex)
      .map(img => {
        const isSelected = img.id === selectedImageId;
        return (
          <div
            key={img.id}
            id={`image-${img.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedImageId(img.id);
              setSelectedShapeId(null);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextBoxId(null);
              setSelectedTextId(null);
            }}
            onMouseDown={(e) => {
              if (isDigitallySigned) return;
              e.stopPropagation();
              setSelectedImageId(img.id);
              setSelectedShapeId(null);
              setSelectedFieldId(null);
              setSelectedHighlightId(null);
              setSelectedTextBoxId(null);
              setSelectedTextId(null);
              handleImageResizeDown(e, img, 'drag');
            }}
            className={`absolute group select-none transition-shadow z-25 cursor-move ${
              isSelected ? 'ring-2 ring-indigo-600 ring-offset-1 shadow-md' : 'hover:ring-1 hover:ring-indigo-400/70'
            }`}
            style={{
              left: img.x,
              top: img.y,
              width: img.width,
              height: img.height,
            }}
          >
            <img
              src={img.dataUrl}
              alt=""
              className="w-full h-full object-fill pointer-events-none select-none block"
            />

            {isSelected && !isDigitallySigned && (
              <>
                {/* 4 Corners: To / Nhỏ (Proportional scale) */}
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-nw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-ne-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-se-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-full cursor-sw-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />

                {/* 4 Edges: Dài / Rộng (Independent width/height) */}
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2.5 bg-white border-2 border-indigo-600 rounded-xs cursor-n-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2.5 bg-white border-2 border-indigo-600 rounded-xs cursor-s-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'w')}
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2.5 h-4 bg-white border-2 border-indigo-600 rounded-xs cursor-w-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />
                <div
                  onMouseDown={(e) => handleImageResizeDown(e, img, 'e')}
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-4 bg-white border-2 border-indigo-600 rounded-xs cursor-e-resize z-40 shadow-xs hover:scale-125 transition-transform"
                />

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImages(prev => prev.filter(item => item.id !== img.id));
                    setSelectedImageId(null);
                  }}
                  className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-lg transition-all z-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </>
            )}
          </div>
        );
      });
  }

  function handleSelectText(t: PdfTextItem) {
    if (isDigitallySigned) {
      alert("Tài liệu hiện tại đã được ký số. Không thể sửa nội dung chữ gốc.");
      return;
    }
    setSelectedTextId(t.id);
    setEditingTextId(t.id);
    ensureFontsLoaded();
  }

  function renderOriginalTexts(pageIndex: number) {
    if (activeTool !== 'Edit Text') return null;
    return pdfTexts
      .filter(t => t.pageIndex === pageIndex && !t.isModified && t.id !== editingTextId)
      .map(t => {
        const borderStyleClass = showTextHighlights 
          ? "outline outline-1 outline-dashed outline-indigo-400/45 bg-indigo-50/10 hover:outline-blue-600 hover:bg-blue-100/20" 
          : "hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-500/70 hover:bg-blue-100/15";

        return (
          <div
            key={t.id}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectText(t);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute cursor-text transition-colors z-20 ${borderStyleClass} rounded-[1px]`}
            style={{
              left: t.x,
              top: t.y,
              width: t.width,
              height: t.height,
            }}
          />
        );
      });
  }

  function renderModifiedTextsOverlay(pageIndex: number) {
    return pdfTexts
      .filter(t => t.pageIndex === pageIndex && (t.isModified || t.id === editingTextId))
      .map(t => {
        const isSelected = selectedTextId === t.id;
        const isEditing = editingTextId === t.id;
        const fontFamily = getFontFamily(t.customFontFamily || t.fontName);
        const useBold = t.isBold;
        const useItalic = t.isItalic;
        const fontStyle = useItalic ? 'italic' : 'normal';
        const fontWeight = useBold ? 700 : 400;
        const customColor = t.customColor || '#000000';
        const hasBg = t.hasBackground !== false;

        const pageWidth = pages[pageIndex]?.width || 800;
        // Font size on 1.5x scaled PDF canvas
        const sizeToUse = (t.customFontSize || t.fontSize) * 1.5;

        // Exact baseline-aligned coordinates (0px shift from original PDF text)
        const baselineY = t.baselineY ?? (t.y + t.height * 0.82);
        const posX = t.x + (t.offsetX || 0);
        const posY = baselineY - sizeToUse * 0.82 + (t.offsetY || 0);

        // Original bounding box for complete whiteout erasure of underlying PDF bitmap
        const origWidth = t.originalWidth || (t.pdfWidth * 1.5) || t.width;
        const origHeight = (t.pdfHeight || t.fontSize) * 1.5;
        const origTop = baselineY - origHeight * 0.86;

        const pageRot = pages[pageIndex]?.pageRotation || 0;
        const screenRot = ((t.rotation || 0) - pageRot + 360) % 360;
        const activeSpans = getNormalizedSpans(t);

        if (isEditing) {
          const maxAvailableWidth = Math.max(40, pageWidth - posX - 12);
          const editBoxWidth = Math.min(Math.max(t.width + 6, origWidth + 4, 28), maxAvailableWidth);
          const hasMultipleSpans = activeSpans.length > 1;
          const primarySpan = activeSpans[0];
          const maxEditSpanSizePx = Math.max(
            sizeToUse,
            ...activeSpans.map(s => (s.fontSize || t.customFontSize || t.fontSize) * 1.5)
          );

          return (
            <React.Fragment key={t.id}>
              {hasBg && (
                <div
                  className="absolute bg-white pointer-events-none z-25"
                  style={{
                    left: t.x - 1.5,
                    top: origTop,
                    width: origWidth + 3,
                    height: origHeight * 1.2,
                  }}
                />
              )}
              <div
                className="absolute z-50 bg-white"
                style={{
                  left: posX,
                  top: posY,
                  width: editBoxWidth,
                  minHeight: maxEditSpanSizePx * 1.05,
                  outline: '1px dashed #2563eb',
                  outlineOffset: '1px',
                  transform: `rotate(${screenRot}deg)`,
                  transformOrigin: 'left top',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Live per-word rich-text overlay right at the original document position */}
                {hasMultipleSpans && (
                  <div
                    className="absolute inset-0 pointer-events-none select-none whitespace-pre overflow-hidden flex items-baseline"
                    style={{
                      lineHeight: 1,
                      height: `${maxEditSpanSizePx * 1.08}px`,
                    }}
                  >
                    {activeSpans.map((seg, sIdx) => {
                      const segSizePx = (seg.fontSize || t.customFontSize || t.fontSize) * 1.5;
                      const segFont = getFontFamily(seg.fontFamily || t.customFontFamily || t.fontName);
                      const segBold = (seg.isBold ?? t.isBold) ? 700 : 400;
                      const segItalic = (seg.isItalic ?? t.isItalic) ? 'italic' : 'normal';
                      const segColor = seg.color || customColor;
                      return (
                        <span
                          key={sIdx}
                          style={{
                            fontSize: `${segSizePx}px`,
                            fontFamily: segFont,
                            fontWeight: segBold,
                            fontStyle: segItalic,
                            color: segColor,
                            lineHeight: 1,
                          }}
                        >
                          {seg.text}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Zero-padding inline textarea at exact document coordinates */}
                <textarea
                  id={`edit-textarea-${t.id}`}
                  defaultValue={t.text}
                  autoFocus
                  rows={1}
                  onFocus={(e) => {
                    e.currentTarget.scrollLeft = 0;
                    e.currentTarget.scrollTop = 0;
                  }}
                  onSelect={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setEditSelectionRange({ id: t.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setEditSelectionRange(null);
                    }
                  }}
                  onMouseUp={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setEditSelectionRange({ id: t.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setEditSelectionRange(null);
                    }
                  }}
                  onKeyUp={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionEnd > el.selectionStart) {
                      setEditSelectionRange({ id: t.id, start: el.selectionStart, end: el.selectionEnd });
                    } else {
                      setEditSelectionRange(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveTextEdit(t.id, e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingTextId(null);
                      setEditSelectionRange(null);
                    }
                  }}
                  onBlur={(e) => {
                    const related = e.relatedTarget as HTMLElement | null;
                    if (related && related.closest('#edit-text-ribbon-bar')) {
                      handleSaveTextEdit(t.id, e.target.value, true);
                      return;
                    }
                    handleSaveTextEdit(t.id, e.target.value);
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.max(maxEditSpanSizePx * 1.05, el.scrollHeight)}px`;
                    handleSaveTextEdit(t.id, el.value, true);
                  }}
                  className={`relative z-10 w-full p-0 m-0 border-0 outline-none resize-none overflow-hidden block ${
                    hasMultipleSpans ? 'bg-transparent selection:bg-blue-500/25 selection:text-transparent' : 'bg-white'
                  }`}
                  style={{
                    fontSize: `${(primarySpan?.fontSize ? primarySpan.fontSize * 1.5 : sizeToUse)}px`,
                    fontFamily: getFontFamily(primarySpan?.fontFamily || t.customFontFamily || t.fontName),
                    fontStyle: (primarySpan?.isItalic ?? t.isItalic) ? 'italic' : 'normal',
                    fontWeight: (primarySpan?.isBold ?? t.isBold) ? 700 : 400,
                    color: hasMultipleSpans ? 'transparent' : (primarySpan?.color || customColor),
                    caretColor: '#000000',
                    lineHeight: 1,
                    height: `${maxEditSpanSizePx * 1.08}px`,
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textRendering: 'geometricPrecision',
                    fontFeatureSettings: '"kern" 1, "liga" 1',
                  }}
                />
              </div>
            </React.Fragment>
          );
        }

        const maxSpanSizePx = Math.max(
          sizeToUse,
          ...activeSpans.map(s => (s.fontSize || t.customFontSize || t.fontSize) * 1.5)
        );

        return (
          <React.Fragment key={t.id}>
            {hasBg && (
              <div
                className="absolute bg-white pointer-events-none z-25"
                style={{
                  left: t.x - 1.5,
                  top: origTop,
                  width: origWidth + 3,
                  height: origHeight * 1.2,
                }}
              />
            )}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(t.id);
                setEditingTextId(t.id);
              }}
              className={`absolute cursor-text transition-colors z-30 group select-none ${
                isSelected
                  ? 'outline outline-1 outline-dashed outline-indigo-600'
                  : activeTool === 'Edit Text'
                  ? 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-500/80'
                  : ''
              }`}
              style={{
                left: posX,
                top: posY,
                minWidth: Math.max(12, t.width),
                minHeight: maxSpanSizePx,
                fontSize: `${sizeToUse}px`,
                fontFamily: fontFamily,
                fontStyle: fontStyle,
                fontWeight: fontWeight,
                color: customColor,
                lineHeight: 1,
                outlineOffset: '2px',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                textRendering: 'geometricPrecision',
                fontFeatureSettings: '"kern" 1, "liga" 1',
                transform: `rotate(${screenRot}deg)`,
                transformOrigin: 'left top',
              }}
            >
              {hasBg && (
                <div 
                  className="absolute bg-white pointer-events-none" 
                  style={{
                    left: -1,
                    top: -Math.max(1, maxSpanSizePx * 0.06),
                    width: 'calc(100% + 2px)',
                    height: `${maxSpanSizePx * 1.16}px`,
                    zIndex: -1,
                  }}
                />
              )}
              <span className="inline-flex items-baseline p-0 m-0 select-none whitespace-pre">
                {activeSpans.map((seg, segIdx) => (
                  <span
                    key={segIdx}
                    style={{
                      fontFamily: getFontFamily(seg.fontFamily || t.customFontFamily || t.fontName),
                      fontSize: `${(seg.fontSize || t.customFontSize || t.fontSize) * 1.5}px`,
                      fontWeight: (seg.isBold ?? t.isBold) ? 700 : 400,
                      fontStyle: (seg.isItalic ?? t.isItalic) ? 'italic' : 'normal',
                      color: seg.color || t.customColor || '#000000',
                      lineHeight: 1,
                    }}
                  >
                    {seg.text}
                  </span>
                ))}
              </span>

              {/* Selection indicators & floating action pill */}
              {isSelected && !isDigitallySigned && (
                <div 
                  className="absolute -top-7 left-0 flex items-center gap-1.5 bg-gray-900/90 text-white text-[10px] px-2 py-0.5 rounded shadow-lg z-50 whitespace-nowrap backdrop-blur-xs select-none"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="font-semibold text-indigo-300">
                    {t.customFontFamily || 'Times New Roman'} {Math.round((t.customFontSize || t.fontSize) * 10) / 10}pt {t.isBold ? '• B' : ''} {t.isItalic ? '• I' : ''}
                  </span>
                  <span className="text-gray-500">|</span>
                  <button 
                    type="button"
                    onClick={() => setEditingTextId(t.id)} 
                    className="hover:text-indigo-300 text-gray-200 cursor-pointer flex items-center gap-0.5 font-medium"
                  >
                    <Edit className="w-2.5 h-2.5" /> Sửa
                  </button>
                  <span className="text-gray-500">|</span>
                  <button 
                    type="button"
                    onClick={() => {
                      handleRestoreText(t.id);
                      setSelectedTextId(null);
                    }} 
                    className="hover:text-red-300 text-gray-300 cursor-pointer flex items-center gap-0.5 font-medium"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Khôi phục gốc
                  </button>
                </div>
              )}

              {!isSelected && activeTool === 'Edit Text' && !isDigitallySigned && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestoreText(t.id);
                    if (selectedTextId === t.id) setSelectedTextId(null);
                  }}
                  title="Khôi phục chữ gốc"
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 cursor-pointer shadow transition-all duration-150 z-50"
                >
                  <X className="w-2.5 h-2.5 stroke-[3]" />
                </button>
              )}
            </div>
          </React.Fragment>
        );
      });
  }

  function RibbonButton({ icon: Icon, label, active, onClick, className = '', disabled = false, title }: any) {
    const lines = label.split('\n');
    return (
      <button 
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`flex flex-col items-center justify-start w-[58px] h-[64px] rounded-lg border ${
          disabled 
            ? 'opacity-40 cursor-not-allowed border-transparent bg-gray-50' 
            : active 
              ? 'bg-indigo-50 border-indigo-300 shadow-inner' 
              : 'border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm'
        } p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group cursor-pointer ${className}`}
      >
        {!active && !disabled && <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity z-0"></div>}
        <Icon className={`w-5 h-5 z-10 ${disabled ? 'text-gray-400' : active ? 'text-indigo-700 drop-shadow-sm' : 'text-gray-700 group-hover:text-indigo-600'}`} strokeWidth={1.5} />
        <span className={`text-[10px] whitespace-normal font-medium leading-[1.1] text-center z-10 ${disabled ? 'text-gray-400' : active ? 'text-indigo-800' : 'text-gray-700'}`}>
           {lines.map((l: string, i: number) => <React.Fragment key={i}>{l}{i < lines.length - 1 && <br/>}</React.Fragment>)}
        </span>
      </button>
    );
  }
}
