/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { 
  PenSquare, Layout, FileDown, X, MousePointer2, FileUp, Loader2, FilePlus, Trash2, Type, ArrowUp, ArrowDown, Edit, HelpCircle, Info, CheckCircle2, MousePointerClick, Bold, Italic, Settings2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfLib from 'pdf-lib';
import { PDFDocument, PDFRawStream, PDFDict, PDFName } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

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
  height: number;
  fontSize: number;
  fontName: string;
  /** Tên font nội bộ trong PDF (e.g. 'F1', 'ABCDEF+Arial') dùng để tra cứu font gốc */
  pdfFontName?: string;
  pageIndex: number;
  isModified: boolean;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
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
};

const getIsSerif = (fontName: string): boolean => {
  const name = (fontName || '').toLowerCase();
  // Bổ sung các font sans-serif phổ biến khác như tahoma, verdana, segoe, arimo
  if (name.includes('sans') || name.includes('arial') || name.includes('helvetica') || 
      name.includes('calibri') || name.includes('roboto') || name.includes('inter') || 
      name.includes('tahoma') || name.includes('verdana') || name.includes('segoe') || 
      name.includes('arimo')) {
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
  textValue?: string;
  fontSize?: number;
};

type PdfPage = {
  width: number;
  height: number;
  dataUrl: string;
};

const checkIsDigitallySigned = (uint8Array: Uint8Array): boolean => {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(uint8Array);
    
    // Digital signatures always have a /Type /Sig and /ByteRange entry.
    // Also check for standard signature dictionary keys or digital signature structures.
    const hasSigType = text.includes('/Type /Sig') || text.includes('/Type/Sig');
    const hasByteRange = text.includes('/ByteRange');
    
    return hasSigType && hasByteRange;
  } catch (e) {
    console.error("Error checking for digital signature:", e);
    return false;
  }
};

const getFontFamily = (fontName: string): string => {
  // Bỏ prefix subset kiểu "ABCDEF+" (ví dụ: "ABCDEF+Arial" → "Arial")
  const cleaned = (fontName || '').replace(/^[A-Z]{6}\+/, '');
  const name = cleaned.toLowerCase();

  // Monospace / Courier
  if (name.includes('courier') || name.includes('mono') || name.includes('consolas') ||
      name.includes('inconsolata') || name.includes('sourcecodemono') || name.includes('firacode')) {
    return '"Courier New", Courier, monospace';
  }
  // Sans-serif phổ biến -> ưu tiên hiển thị Arial của hệ thống trước, fallback về Arimo/Roboto
  if (name.includes('helvetica') || name.includes('arial') || name.includes('calibri') ||
      name.includes('sans') || name.includes('roboto') || name.includes('inter') ||
      name.includes('opensans') || name.includes('nunito') || name.includes('lato') ||
      name.includes('ubuntu') || name.includes('gill') || name.includes('futura') ||
      name.includes('optima') || name.includes('tahoma') || name.includes('verdana') ||
      name.includes('trebuchet') || name.includes('segoe')) {
    return '"Arial", "Arimo", "Roboto", sans-serif';
  }
  // Serif phổ biến -> ưu tiên hiển thị Times New Roman của hệ thống trước, fallback về Tinos
  if (name.includes('times') || name.includes('georgia') || name.includes('palatino') ||
      name.includes('garamond') || name.includes('baskerville') || name.includes('cambria') ||
      name.includes('book antiqua') || name.includes('century') || name.includes('minion') ||
      name.includes('constantia') || name.includes('tinos') || name.includes('serif')) {
    return '"Times New Roman", "Tinos", Times, serif';
  }
  // Font tiếng Việt phổ biến → sans-serif
  if (name.includes('unicode') || name.includes('viet') || name.includes('arimo') || name.includes('noto')) {
    return '"Arial", "Arimo", sans-serif';
  }
  // Mặc định: nếu không nhận ra thì dùng serif (Times New Roman)
  return '"Times New Roman", "Tinos", Times, serif';
};

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
  const [pdfTexts, setPdfTexts] = useState<PdfTextItem[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [vietnameseFontBytes, setVietnameseFontBytes] = useState<Uint8Array | null>(null);
  /** Cache font bytes trích xuất từ PDF gốc, key là tên font internal (pdfFontName) */
  const [extractedFontCache, setExtractedFontCache] = useState<Map<string, Uint8Array>>(new Map());

  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFilename, setExportFilename] = useState<string>('');

  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [activeHelpTab, setActiveHelpTab] = useState<'document' | 'fields' | 'edit_text' | 'export_overwrite'>('document');

  // Styling & Nudging States for PDF text edits
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showTextHighlights, setShowTextHighlights] = useState<boolean>(true);

  // Lazy-loaded high-quality Vietnamese fonts
  const [fontSerifRegular, setFontSerifRegular] = useState<Uint8Array | null>(null);
  const [fontSerifBold, setFontSerifBold] = useState<Uint8Array | null>(null);
  const [fontSerifItalic, setFontSerifItalic] = useState<Uint8Array | null>(null);
  const [fontSansRegular, setFontSansRegular] = useState<Uint8Array | null>(null);
  const [fontSansBold, setFontSansBold] = useState<Uint8Array | null>(null);
  const [fontSansItalic, setFontSansItalic] = useState<Uint8Array | null>(null);

  const [fontsLoading, setFontsLoading] = useState<boolean>(false);
  const [fontsLoaded, setFontsLoaded] = useState<boolean>(false);
  const fontsLoadingPromiseRef = useRef<Promise<void> | null>(null);

  /** Font file do user upload (.ttf/.otf) để dùng khi export thay cho fallback font */
  const [userUploadedFontBytes, setUserUploadedFontBytes] = useState<Uint8Array | null>(null);
  const [userUploadedFontName, setUserUploadedFontName] = useState<string>('');

  const ensureFontsLoaded = async () => {
    if (fontsLoaded) return;
    if (fontsLoadingPromiseRef.current) {
      await fontsLoadingPromiseRef.current;
      return;
    }

    let resolvePromise: () => void = () => {};
    fontsLoadingPromiseRef.current = new Promise<void>((resolve) => {
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
        'https://raw.githubusercontent.com/asif-mahmud/times-new-roman/master/times.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Regular.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/tinos/Tinos-Regular.ttf'
      ];
      const serifBoldUrls = [
        'https://raw.githubusercontent.com/asif-mahmud/times-new-roman/master/timesbd.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Bold.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/tinos/Tinos-Bold.ttf'
      ];
      const serifItalicUrls = [
        'https://raw.githubusercontent.com/asif-mahmud/times-new-roman/master/timesi.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tinos/Tinos-Italic.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/tinos/Tinos-Italic.ttf'
      ];

      const sansRegularUrls = [
        'https://raw.githubusercontent.com/catap/msttcorefonts/master/arial.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo-Regular.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Regular.ttf'
      ];
      const sansBoldUrls = [
        'https://raw.githubusercontent.com/catap/msttcorefonts/master/arialbd.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo-Bold.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Bold.ttf'
      ];
      const sansItalicUrls = [
        'https://raw.githubusercontent.com/catap/msttcorefonts/master/ariali.ttf',
        'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo-Italic.ttf',
        'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Italic.ttf'
      ];

      const [sr, sb, si, sar, sab, sai] = await Promise.all([
        loadFontWithFallbacks(serifRegularUrls),
        loadFontWithFallbacks(serifBoldUrls),
        loadFontWithFallbacks(serifItalicUrls),
        loadFontWithFallbacks(sansRegularUrls),
        loadFontWithFallbacks(sansBoldUrls),
        loadFontWithFallbacks(sansItalicUrls)
      ]);

      if (sr) setFontSerifRegular(sr);
      if (sb) setFontSerifBold(sb);
      if (si) setFontSerifItalic(si);
      if (sar) setFontSansRegular(sar);
      if (sab) setFontSansBold(sab);
      if (sai) setFontSansItalic(sai);

      setFontsLoaded(true);
      console.log("All Vietnamese fonts loaded successfully.");
    } catch (err) {
      console.error("Error loading fonts:", err);
    } finally {
      setFontsLoading(false);
      resolvePromise();
      fontsLoadingPromiseRef.current = null;
    }
  };

  useEffect(() => {
    // Pre-load all Vietnamese fonts in the background immediately on app mount
    ensureFontsLoaded();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool('Select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const loadFont = async () => {
      try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/roboto/static/Roboto-Regular.ttf');
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          setVietnameseFontBytes(new Uint8Array(buffer));
          console.log("Vietnamese font loaded successfully.");
        } else {
          // fallback to Arimo
          const resp2 = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/arimo/Arimo-Regular.ttf');
          if (resp2.ok) {
            const buffer = await resp2.arrayBuffer();
            setVietnameseFontBytes(new Uint8Array(buffer));
            console.log("Vietnamese font (Arimo) loaded successfully.");
          }
        }
      } catch (err) {
        console.error("Failed to load Roboto/Arimo font from CDN:", err);
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

  /**
   * Kiểm tra magic bytes để xác nhận đây là TTF/OTF/TTC hợp lệ.
   */
  const isFontBytes = (bytes: Uint8Array): boolean => {
    if (bytes.length < 4) return false;
    // TrueType: 0x00010000
    if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return true;
    // OTF/CFF: 'OTTO'
    if (bytes[0] === 0x4F && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4F) return true;
    // TTC: 'ttcf'
    if (bytes[0] === 0x74 && bytes[1] === 0x74 && bytes[2] === 0x63 && bytes[3] === 0x66) return true;
    // 'true' (some Mac TTF)
    if (bytes[0] === 0x74 && bytes[1] === 0x72 && bytes[2] === 0x75 && bytes[3] === 0x65) return true;
    return false;
  };

  /**
   * Trích xuất font bytes từ PDF gốc bằng pdf-lib để nhúng lại khi export.
   * Key của map là tên font internal trong PDF (e.g. 'F1', 'ABCDEF+Arial').
   * Sử dụng decodePDFRawStream để decode stream đã bị compress.
   * Lưu ý: Chỉ trích xuất được font nhúng đầy đủ (không subsetted hoàn toàn).
   */
  const extractFontsFromPdf = async (buffer: ArrayBuffer | Uint8Array): Promise<Map<string, Uint8Array>> => {
    const fontCache = new Map<string, Uint8Array>();
    try {
      const pdfDoc = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        try {
          const resources = page.node.Resources();
          if (!resources) continue;
          const fontDict = resources.lookup(PDFName.of('Font'), PDFDict);
          if (!fontDict) continue;
          for (const [key, ref] of fontDict.entries()) {
            const fontKey = key.encodedName || (key as any).asString?.() || String(key);
            if (fontCache.has(fontKey)) continue;
            try {
              const fontObj = pdfDoc.context.lookup(ref);
              if (!(fontObj instanceof PDFDict)) continue;
              // Tìm FontDescriptor -> FontFile/FontFile2/FontFile3
              const descriptorRef = fontObj.get(PDFName.of('FontDescriptor'));
              if (!descriptorRef) continue;
              const descriptor = pdfDoc.context.lookup(descriptorRef);
              if (!(descriptor instanceof PDFDict)) continue;
              // Thử lần lượt FontFile2 (TrueType), FontFile (Type1), FontFile3 (OpenType)
              for (const fileKey of ['FontFile2', 'FontFile', 'FontFile3']) {
                const fontFileRef = descriptor.get(PDFName.of(fileKey));
                if (!fontFileRef) continue;
                const fontStream = pdfDoc.context.lookup(fontFileRef);
                if (!(fontStream instanceof PDFRawStream)) continue;
                // Lấy raw bytes từ font stream
                // Nếu bytes là compressed sẽ không pass isFontBytes check và bị skip
                const rawBytes = fontStream.contents;
                if (!rawBytes || rawBytes.length === 0) continue;
                // Chỉ lưu nếu là font hợp lệ (magic bytes TTF/OTF)
                if (isFontBytes(rawBytes)) {
                  fontCache.set(fontKey, rawBytes);
                  break;
                }
              }
            } catch (e) {
              // Bỏ qua font không đọc được
            }
          }
        } catch (e) {
          // Bỏ qua trang có lỗi
        }
      }
    } catch (e) {
      console.warn('Không thể trích xuất font từ PDF:', e);
    }
    return fontCache;
  };

  const renderPdfPages = async (buffer: ArrayBuffer | Uint8Array) => {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const parsedPages: PdfPage[] = [];
    const extractedTexts: PdfTextItem[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport: viewport
      } as any).promise;

      parsedPages.push({
        width: viewport.width,
        height: viewport.height,
        dataUrl: canvas.toDataURL('image/jpeg', 0.8)
      });

      try {
        const textContent = await page.getTextContent();
        textContent.items.forEach((item: any, idx: number) => {
          if (!item.str || item.str.trim() === '') return;

          const transform = item.transform;
          const tx = transform[4];
          const ty = transform[5];
          
          const [vx, vy] = viewport.convertToViewportPoint(tx, ty);

          const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
          const scale = viewport.scale;
          const itemWidth = item.width * scale;
          const itemHeight = fontSize * scale;

          // vy is the baseline, calculate finalY for the top-left of the box
          const finalY = vy - itemHeight;

          const styleObj = textContent.styles ? textContent.styles[item.fontName] : null;
          const resolvedFontName = styleObj ? styleObj.fontFamily : (item.fontName || 'serif');
          // item.fontName là tên font internal trong PDF (dùng để tra cứu font bytes)
          const pdfInternalFontName = item.fontName || '';

          extractedTexts.push({
            id: `text-${i - 1}-${idx}`,
            text: item.str,
            originalText: item.str,
            x: vx,
            y: finalY,
            width: itemWidth || 50,
            height: itemHeight || fontSize,
            fontSize: fontSize,
            fontName: resolvedFontName,
            pdfFontName: pdfInternalFontName,
            pageIndex: i - 1,
            isModified: false,
            pdfX: tx,
            pdfY: ty,
            pdfWidth: item.width,
            pdfHeight: fontSize,
            // default custom styles
            // Ưu tiên tin cậy tên font gốc trong PDF (pdfInternalFontName) trước để tránh PDF.js giải mã sai sang sans-serif
            customFontFamily: getIsSerif(pdfInternalFontName || resolvedFontName || 'serif') ? 'serif' : 'sans-serif',
            customFontSize: fontSize,
            isBold: resolvedFontName.toLowerCase().includes('bold') || pdfInternalFontName.toLowerCase().includes('bold') || false,
            isItalic: resolvedFontName.toLowerCase().includes('italic') || resolvedFontName.toLowerCase().includes('oblique') || 
                      pdfInternalFontName.toLowerCase().includes('italic') || pdfInternalFontName.toLowerCase().includes('oblique') || false,
            offsetX: 0,
            offsetY: 0,
            hasBackground: true,
            customColor: '#000000',
          });
        });
      } catch (err) {
        console.error(`Error extracting text content at page ${i}:`, err);
      }
    }
    setPages(parsedPages);
    setPdfTexts(extractedTexts);
    setSelectedPageIndices([]);
    // Trích xuất font gốc từ PDF để nhúng lại chính xác khi export
    extractFontsFromPdf(buffer).then(cache => {
      setExtractedFontCache(cache);
      console.log(`Đã trích xuất ${cache.size} font từ PDF:`, Array.from(cache.keys()));
    }).catch(e => {
      console.warn('Không thể trích xuất font từ PDF:', e);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setDocumentName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      setOriginalPdfBuffer(uint8Array);
      
      const isSigned = checkIsDigitallySigned(uint8Array);
      setIsDigitallySigned(isSigned);
      
      await renderPdfPages(uint8Array);
      setFields([]); 
    } catch (err) {
      console.error("Error parsing PDF", err);
      alert("Không thể đọc file PDF này.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

      setSelectedPageIndices([]);
      await renderPdfPages(newPdfBytes);
    } catch (e) {
      console.error(e);
      alert("Không thể xóa các trang này.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveTextEdit = (id: string, newText: string) => {
    setPdfTexts(prev => prev.map(t => {
      if (t.id === id) {
        const isModified = newText !== t.originalText;
        return { ...t, text: newText, isModified };
      }
      return t;
    }));
    setEditingTextId(null);
    // Giữ sidebar mở nếu đang hiển thị (không xóa selectedTextId)
  };

  const handleRestoreText = (id: string) => {
    setPdfTexts(pdfTexts.map(t => {
      if (t.id === id) {
        return { 
          ...t, 
          text: t.originalText, 
          isModified: false,
          customFontFamily: undefined,
          customFontSize: undefined,
          customColor: undefined,
          isBold: undefined,
          isItalic: undefined,
          offsetX: 0,
          offsetY: 0,
          hasBackground: true,
          rotation: 0
        };
      }
      return t;
    }));
    setEditingTextId(null);
  };

  const handleMouseDown = (e: React.MouseEvent, pageIndex: number) => {
    if (isDigitallySigned) {
      alert("Tài liệu này đã được ký số. Không thể thêm trường chữ ký hoặc trường văn bản mới.");
      return;
    }
    if (activeTool === 'Select') {
      setSelectedFieldId(null);
      return;
    }
    if (activeTool !== 'Signature Field' && activeTool !== 'Text Field') return;
    
    setSelectedFieldId(null);
    const pageElement = e.currentTarget as HTMLDivElement;
    const rect = pageElement.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawing({ pageIndex, startX: x, startY: y, currentX: x, currentY: y });
  };

  const handleResizeDown = (e: React.MouseEvent, f: Field, type: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
      if (isDigitallySigned) {
          alert("Tài liệu này đã được ký số. Việc thay đổi kích thước trường đã bị khóa.");
          return;
      }
      e.stopPropagation();
      const pageElement = (e.currentTarget as HTMLElement).closest('.relative.flex-shrink-0') as HTMLDivElement;
      if (pageElement) {
          const rect = pageElement.getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
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

  const handleMouseUp = () => {
    if (fieldInteraction) {
      setFieldInteraction(null);
      return;
    }
    
    if (!drawing) return;
    
    let width = Math.abs(drawing.currentX - drawing.startX);
    let height = Math.abs(drawing.currentY - drawing.startY);
    let x = Math.min(drawing.startX, drawing.currentX);
    let y = Math.min(drawing.startY, drawing.currentY);
    
    if (width < 5 || height < 5) {
      width = activeTool === 'Text Field' ? 150 : 120;
      height = activeTool === 'Text Field' ? 30 : 50;
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
        }]);
        setSelectedFieldId(newId);
      } else if (activeTool === 'Text Field') {
        const defaultName = `TextField${fields.filter(f => f.type === 'text').length + 1}`;
        setFields([...fields, {
          id: newId,
          pageIndex: drawing.pageIndex,
          x, y, width, height,
          type: 'text',
          name: defaultName,
          textValue: '',
          fontSize: 12,
        }]);
        setSelectedFieldId(newId);
      }
    }
    
    setDrawing(null);
  };

  const deleteField = (id: string) => {
    if (isDigitallySigned) {
      alert("Tài liệu này đã được ký số. Việc xóa trường đã bị khóa.");
      return;
    }
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
      await ensureFontsLoaded();
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      
      // Register fontkit to support custom TrueType fonts for Vietnamese Unicode
      pdfDoc.registerFontkit(fontkit);
      
      // Fallback strategy: create safe, guaranteed TrueType font buffers supporting Vietnamese Unicode
      const safeSerifRegular = fontSerifRegular || vietnameseFontBytes || fontSansRegular;
      const safeSerifBold = fontSerifBold || safeSerifRegular;
      const safeSerifItalic = fontSerifItalic || safeSerifRegular;

      const safeSansRegular = fontSansRegular || vietnameseFontBytes || fontSerifRegular;
      const safeSansBold = fontSansBold || safeSansRegular;
      const safeSansItalic = fontSansItalic || safeSansRegular;

      // Embed fallback fonts (Tinos/Roboto) - chỉ dùng khi không có font gốc
      const embeddedSerifRegular = safeSerifRegular ? await pdfDoc.embedFont(safeSerifRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRoman);
      const embeddedSerifBold = safeSerifBold ? await pdfDoc.embedFont(safeSerifBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanBold);
      const embeddedSerifItalic = safeSerifItalic ? await pdfDoc.embedFont(safeSerifItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.TimesRomanItalic);
      
      const embeddedSansRegular = safeSansRegular ? await pdfDoc.embedFont(safeSansRegular) : await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
      const embeddedSansBold = safeSansBold ? await pdfDoc.embedFont(safeSansBold) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
      const embeddedSansItalic = safeSansItalic ? await pdfDoc.embedFont(safeSansItalic) : await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaOblique);

      // Cache font gốc đã embed để tránh embed lại nhiều lần
      const embeddedOriginalFontCache = new Map<string, pdfLib.PDFFont>();

      /**
       * Lấy font đã nhúng theo thứ tự ưu tiên:
       * 1. Font user đã upload (chính xác nhất)
       * 2. Font gốc trích xuất từ PDF (nếu không bị subset)
       * 3. Fallback: Tinos (serif) / Roboto (sans-serif)
       */
      const getEmbeddedFont = async (
        pdfFontName: string | undefined,
        isSerif: boolean,
        isBold: boolean,
        isItalic: boolean
      ): Promise<pdfLib.PDFFont> => {
        // Ưu tiên 1: Font do người dùng chủ động tải lên (.ttf/.otf)
        if (userUploadedFontBytes && userUploadedFontBytes.length > 0) {
          const userCacheKey = `user|${isBold}|${isItalic}`;
          if (embeddedOriginalFontCache.has(userCacheKey)) {
            return embeddedOriginalFontCache.get(userCacheKey)!;
          }
          try {
            const embedded = await pdfDoc.embedFont(userUploadedFontBytes);
            embeddedOriginalFontCache.set(userCacheKey, embedded);
            return embedded;
          } catch (e) {
            console.warn('Không thể embed font user đã upload, dùng fallback chuẩn:', e);
          }
        }

        // Ưu tiên 2: Sử dụng các bộ font TrueType Việt hóa chất lượng cao (Arimo cho sans-serif, Tinos cho serif)
        // để tránh lỗi font gốc của PDF bị subset thiếu ký tự tiếng Việt gõ mới.
        if (isSerif) {
          if (isBold) return embeddedSerifBold;
          if (isItalic) return embeddedSerifItalic;
          return embeddedSerifRegular;
        } else {
          if (isBold) return embeddedSansBold;
          if (isItalic) return embeddedSansItalic;
          return embeddedSansRegular;
        }
      };

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
            if (t.hasBackground !== false) {
              page.drawRectangle({
                 x: finalPdfX - 1,
                 y: finalPdfY - fontSizeToUse * 0.25,
                 width: t.pdfWidth * 1.05 + 2,
                 height: fontSizeToUse * 1.3,
                 color: pdfLib.rgb(1, 1, 1),
                 rotate: pdfLib.degrees(t.rotation || 0),
              });
            }

            // Xác định loại font (serif/sans) để fallback
            const isSerif = t.customFontFamily === 'serif' || (t.customFontFamily !== 'sans-serif' && getIsSerif(t.fontName));
            const isBold = t.isBold || false;
            const isItalic = t.isItalic || false;

            // Ưu tiên font gốc từ PDF, fallback về Tinos/Roboto
            const fontToUse = await getEmbeddedFont(t.pdfFontName, isSerif, isBold, isItalic);

            // Draw new edited text
            page.drawText(t.text, {
               x: finalPdfX,
               y: finalPdfY,
               size: fontSizeToUse,
               font: fontToUse,
               color: hexToRgb(t.customColor || '#000000'),
               rotate: pdfLib.degrees(t.rotation || 0),
            });
         }
      }

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
            // Remove existing signature/field with same name to allow overwriting
            try {
              const existingField = form.getField(f.name);
              if (existingField) {
                form.removeField(existingField);
              }
            } catch (e) {
              // Ignore if field doesn't exist
            }

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
              // Remove existing text field with same ID/name to allow overwriting
              try {
                const existingField = form.getField(f.id);
                if (existingField) {
                  form.removeField(existingField);
                }
              } catch (e) {
                // Ignore if field doesn't exist
              }

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
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const rawName = customFilename || documentName;
      const downloadName = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;
      a.download = downloadName;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch(err) {
      console.error(err);
      alert("Không thể xuất file PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderFormattingSidebar = () => {
    if (!selectedTextId) return null;
    const item = pdfTexts.find(t => t.id === selectedTextId);
    if (!item) return null;

    const handleTextPropChange = (id: string, updates: Partial<PdfTextItem>) => {
      setPdfTexts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    return (
      <div className="w-80 bg-white border-l border-gray-300 flex flex-col shadow-2xl z-40 overflow-y-auto">
        {/* Sidebar Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white p-4 flex justify-between items-center shadow-md flex-shrink-0">
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Edit className="w-4 h-4" />
            <span>Định dạng chữ đã chọn</span>
          </div>
          <button 
            onClick={() => setSelectedTextId(null)}
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Đóng bảng định dạng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="p-4 flex flex-col gap-5 text-xs text-gray-700 flex-1">
          {/* Info: chỉnh sửa trực tiếp */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="text-blue-500 text-base mt-0.5">✏️</span>
            <div>
              <p className="text-[11px] text-blue-800 font-semibold leading-snug">Chỉnh sửa trực tiếp</p>
              <p className="text-[10px] text-blue-600 leading-snug mt-0.5">Nhấp thẳng vào chữ trên trang để gõ chỉnh sửa. Font tự động nhận dạng từ PDF.</p>
              <button
                onClick={() => setEditingTextId(item.id)}
                className="mt-1.5 text-[10px] bg-blue-600 text-white px-2.5 py-1 rounded font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
              >
                📝 Mở chỉnh sửa ngay
              </button>
            </div>
          </div>

          {/* Font / Phông chữ khi xuất */}
          <div className="flex flex-col gap-1.5">
            <span className="font-bold text-gray-800 flex items-center gap-1">🔤 Phông chữ khi xuất:</span>

            {userUploadedFontBytes ? (
              /* Font user đã upload */
              <div className="flex items-center gap-2 bg-green-50 border border-green-300 rounded px-2 py-1.5">
                <span className="text-green-700 text-[10px] font-semibold flex-1 truncate">
                  ✅ Font tùy chỉnh: <span className="font-mono">{userUploadedFontName}</span>
                </span>
                <button
                  onClick={() => { setUserUploadedFontBytes(null); setUserUploadedFontName(''); }}
                  className="text-red-400 hover:text-red-600 transition-colors text-[10px] font-bold cursor-pointer"
                  title="Xóa font đã upload"
                >✕</button>
              </div>
            ) : (
              /* Font tự nhận dạng + tùy chọn override */
              <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-[10px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-500">Font nhận dạng:</span>
                  <span className="font-mono text-indigo-700 font-semibold truncate max-w-[120px]">
                    {(item.fontName || '').replace(/^[A-Z]{6}\+/, '') || '(không rõ)'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleTextPropChange(item.id, { customFontFamily: undefined, isModified: true })}
                    className={`flex-1 py-1 border rounded text-center transition-all cursor-pointer text-[10px] ${
                      !item.customFontFamily
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Tự động
                  </button>
                  <button
                    onClick={() => handleTextPropChange(item.id, { customFontFamily: 'sans-serif', isModified: true })}
                    className={`flex-1 py-1 border rounded text-center transition-all cursor-pointer text-[10px] ${
                      item.customFontFamily === 'sans-serif'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Không chân
                  </button>
                  <button
                    onClick={() => handleTextPropChange(item.id, { customFontFamily: 'serif', isModified: true })}
                    className={`flex-1 py-1 border rounded text-center transition-all cursor-pointer text-[10px] ${
                      item.customFontFamily === 'serif'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Có chân
                  </button>
                </div>
              </div>
            )}

            {/* Upload font file (gọn lại) */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-indigo-600 hover:text-indigo-800 transition-colors mt-0.5">
              <span>⬆ Tải font file (.ttf/.otf) để xuất đúng font</span>
              <input
                type="file"
                accept=".ttf,.otf,.woff"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const buf = await file.arrayBuffer();
                    setUserUploadedFontBytes(new Uint8Array(buf));
                    setUserUploadedFontName(file.name);
                  } catch(err) {
                    alert('Không thể đọc file font.');
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Font Weight & Styles */}
          <div className="flex flex-col gap-1.5">
            <span className="font-bold text-gray-800 flex items-center gap-1">💅 Kiểu chữ:</span>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => handleTextPropChange(item.id, { isBold: !item.isBold, isModified: true })}
                className={`py-1.5 px-3 border rounded font-bold text-center transition-all cursor-pointer text-[11px] ${
                  item.isBold 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm font-bold' 
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Chữ Đậm (B)
              </button>
              <button 
                onClick={() => handleTextPropChange(item.id, { isItalic: !item.isItalic, isModified: true })}
                className={`py-1.5 px-3 border rounded italic font-semibold text-center transition-all cursor-pointer text-[11px] ${
                  item.isItalic 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm font-bold' 
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Chữ Nghiêng (I)
              </button>
            </div>
          </div>

          {/* Font Size Selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800">📏 Cỡ chữ:</span>
              <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold">
                {Math.round(item.customFontSize || item.fontSize)} pt
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input 
                type="range"
                min={Math.max(4, Math.round(item.fontSize * 0.4))}
                max={Math.min(72, Math.round(item.fontSize * 3))}
                step={0.5}
                value={item.customFontSize || item.fontSize}
                onChange={(e) => handleTextPropChange(item.id, { customFontSize: parseFloat(e.target.value), isModified: true })}
                className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <input 
                type="number"
                min={2}
                max={150}
                value={Math.round(item.customFontSize || item.fontSize)}
                onChange={(e) => handleTextPropChange(item.id, { customFontSize: parseInt(e.target.value) || item.fontSize, isModified: true })}
                className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center font-mono outline-none text-[11px] bg-white text-gray-800"
              />
            </div>
          </div>

          {/* Color Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="font-bold text-gray-800 flex items-center gap-1">🎨 Màu chữ:</span>
            <div className="flex items-center gap-2">
              {['#000000', '#FF0000', '#0000FF', '#008000'].map(color => (
                <button
                  key={color}
                  onClick={() => handleTextPropChange(item.id, { customColor: color, isModified: true })}
                  className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center transition-transform hover:scale-110 shadow-xs cursor-pointer"
                  style={{ backgroundColor: color }}
                >
                  {(item.customColor || '#000000') === color && (
                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                  )}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto border border-gray-300 rounded px-2 py-1 bg-gray-50/50">
                <input 
                  type="color" 
                  value={item.customColor || '#000000'}
                  onChange={(e) => handleTextPropChange(item.id, { customColor: e.target.value, isModified: true })}
                  className="w-4 h-4 rounded border-0 cursor-pointer p-0 bg-transparent"
                />
                <input 
                  type="text" 
                  value={item.customColor || '#000000'}
                  onChange={(e) => handleTextPropChange(item.id, { customColor: e.target.value, isModified: true })}
                  className="w-16 text-[10px] uppercase outline-none bg-transparent font-mono text-gray-800"
                />
              </div>
            </div>
          </div>

          {/* Background Whiteout Toggle */}
          <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-gray-800">
              <input 
                type="checkbox" 
                checked={item.hasBackground !== false} 
                onChange={(e) => handleTextPropChange(item.id, { hasBackground: e.target.checked, isModified: true })}
                className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              <span>Đè lên chữ gốc (Xóa nền chữ gốc)</span>
            </label>
            <p className="text-[10px] text-gray-400 leading-normal pl-5">
              * Che vùng chữ cũ bên dưới bằng hộp trắng trước khi đè chữ mới, giúp tránh hiện tượng bị chồng nét hay rối chữ gốc.
            </p>
          </div>

          {/* Text Rotation Control */}
          <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-800 flex items-center gap-1">🔄 Góc xoay chữ:</span>
              <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold">
                {item.rotation || 0}°
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <input 
                type="range"
                min={0}
                max={360}
                step={1}
                value={item.rotation || 0}
                onChange={(e) => handleTextPropChange(item.id, { rotation: parseInt(e.target.value) || 0, isModified: true })}
                className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <input 
                type="number"
                min={0}
                max={360}
                value={item.rotation || 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  handleTextPropChange(item.id, { rotation: isNaN(val) ? 0 : (val % 360 + 360) % 360, isModified: true });
                }}
                className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center font-mono outline-none text-[11px] bg-white text-gray-800"
              />
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  onClick={() => handleTextPropChange(item.id, { rotation: deg, isModified: true })}
                  className={`py-1 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                    (item.rotation || 0) === deg
                      ? 'bg-indigo-600 border-indigo-600 text-white font-bold'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>

            <div className="flex justify-between mt-1 text-[10px] text-gray-500 px-0.5">
              <button
                onClick={() => {
                  const current = item.rotation || 0;
                  const target = (current - 45 + 360) % 360;
                  handleTextPropChange(item.id, { rotation: target, isModified: true });
                }}
                className="hover:text-indigo-600 font-medium cursor-pointer"
              >
                -45°
              </button>
              <button
                onClick={() => {
                  const current = item.rotation || 0;
                  const target = (current - 90 + 360) % 360;
                  handleTextPropChange(item.id, { rotation: target, isModified: true });
                }}
                className="hover:text-indigo-600 font-medium cursor-pointer"
              >
                -90°
              </button>
              <button
                onClick={() => handleTextPropChange(item.id, { rotation: 0, isModified: true })}
                className="hover:text-indigo-600 font-medium cursor-pointer"
              >
                Đặt lại
              </button>
              <button
                onClick={() => {
                  const current = item.rotation || 0;
                  const target = (current + 90) % 360;
                  handleTextPropChange(item.id, { rotation: target, isModified: true });
                }}
                className="hover:text-indigo-600 font-medium cursor-pointer"
              >
                +90°
              </button>
              <button
                onClick={() => {
                  const current = item.rotation || 0;
                  const target = (current + 45) % 360;
                  handleTextPropChange(item.id, { rotation: target, isModified: true });
                }}
                className="hover:text-indigo-600 font-medium cursor-pointer"
              >
                +45°
              </button>
            </div>
          </div>

          {/* Position Nudging */}
          <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
            <span className="font-bold text-gray-800 flex items-center gap-1">🎯 Vi chỉnh vị trí (Nudge):</span>
            <div className="flex flex-col items-center gap-1 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
              <button 
                onClick={() => handleTextPropChange(item.id, { offsetY: (item.offsetY || 0) - 1, isModified: true })}
                className="p-1 hover:bg-white border border-gray-300 rounded shadow-xs hover:text-indigo-600 cursor-pointer"
                title="Lên 1px"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <div className="flex gap-4 items-center">
                <button 
                  onClick={() => handleTextPropChange(item.id, { offsetX: (item.offsetX || 0) - 1, isModified: true })}
                  className="p-1 hover:bg-white border border-gray-300 rounded shadow-xs hover:text-indigo-600 cursor-pointer"
                  title="Trái 1px"
                >
                  <span className="transform -rotate-90 block">
                    <ArrowUp className="w-4 h-4" />
                  </span>
                </button>
                <span className="text-[10px] text-gray-400 font-mono font-medium whitespace-nowrap select-all">
                  X:{item.offsetX || 0}px | Y:{item.offsetY || 0}px
                </span>
                <button 
                  onClick={() => handleTextPropChange(item.id, { offsetX: (item.offsetX || 0) + 1, isModified: true })}
                  className="p-1 hover:bg-white border border-gray-300 rounded shadow-xs hover:text-indigo-600 cursor-pointer"
                  title="Phải 1px"
                >
                  <span className="transform rotate-90 block">
                    <ArrowUp className="w-4 h-4" />
                  </span>
                </button>
              </div>
              <button 
                onClick={() => handleTextPropChange(item.id, { offsetY: (item.offsetY || 0) + 1, isModified: true })}
                className="p-1 hover:bg-white border border-gray-300 rounded shadow-xs hover:text-indigo-600 cursor-pointer"
                title="Xuống 1px"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              
              <div className="flex gap-2 mt-2 w-full">
                <button 
                  onClick={() => handleTextPropChange(item.id, { offsetX: 0, offsetY: 0, isModified: true })}
                  className="text-[10px] text-indigo-600 font-bold hover:underline mx-auto cursor-pointer"
                >
                  Đặt lại vị trí
                </button>
              </div>
            </div>
          </div>

          {/* Restore / Delete Change */}
          <div className="border-t border-gray-200 pt-4 flex gap-2">
            <button
              onClick={() => {
                handleRestoreText(item.id);
                setSelectedTextId(null);
              }}
              className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-2 px-3 rounded text-center transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5 text-[11px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Khôi phục chữ gốc</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col h-screen overflow-hidden bg-gray-100 font-sans select-none text-gray-800"
      onMouseMove={(e) => {
        if (fieldInteraction) {
          const pageElement = document.getElementById(`page-${fieldInteraction.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = e.clientX - rect.left;
          let y = e.clientY - rect.top;
          
          const dx = x - fieldInteraction.startX;
          const dy = y - fieldInteraction.startY;
          
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
            
            newX = Math.max(0, Math.min(rect.width - newW, newX));
            newY = Math.max(0, Math.min(rect.height - newH, newY));
            
            return { ...f, x: newX, y: newY, width: newW, height: newH };
          }));
        } else if (drawing) {
          const pageElement = document.getElementById(`page-${drawing.pageIndex}`);
          if (!pageElement) return;
          const rect = pageElement.getBoundingClientRect();
          let x = e.clientX - rect.left;
          let y = e.clientY - rect.top;
          x = Math.max(0, Math.min(rect.width, x));
          y = Math.max(0, Math.min(rect.height, y));
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

      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[150]">
           <div className="bg-white p-6 rounded-lg shadow-2xl max-w-md w-full border border-gray-100 flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                 <FileDown className="w-5 h-5 text-indigo-600" />
                 <h3 className="text-base font-bold text-gray-800">Cấu hình xuất file PDF</h3>
              </div>
              
              <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-semibold text-gray-600">Tên file tải xuống:</label>
                 <input 
                    type="text" 
                    value={exportFilename} 
                    onChange={(e) => setExportFilename(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                    placeholder="Nhập tên file"
                 />
              </div>

              <div className="flex flex-col gap-2">
                 <span className="text-xs font-semibold text-gray-600">Mẫu đặt tên nhanh:</span>
                 <div className="flex gap-2">
                    <button 
                       type="button"
                       onClick={() => {
                         setExportFilename(documentName);
                       }}
                       className="flex-1 text-[11px] font-bold py-1.5 px-2 border border-gray-300 hover:border-indigo-500 hover:text-indigo-600 text-gray-600 rounded bg-gray-50 hover:bg-indigo-50 transition-colors"
                    >
                       Giữ tên gốc
                    </button>
                    <button 
                       type="button"
                       onClick={() => {
                         const nameWithoutPdf = documentName.replace(/\.pdf$/i, '');
                         setExportFilename(`${nameWithoutPdf}_co_vung_ky.pdf`);
                       }}
                       className="flex-1 text-[11px] font-bold py-1.5 px-2 border border-gray-300 hover:border-indigo-500 hover:text-indigo-600 text-gray-600 rounded bg-gray-50 hover:bg-indigo-50 transition-colors"
                    >
                       Thêm hậu tố "_co_vung_ky"
                    </button>
                 </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-800 leading-relaxed flex flex-col gap-1">
                 <span className="font-bold text-[12px] flex items-center gap-1">💡 Hướng dẫn ghi đè lên file cũ:</span>
                 <span>Để ghi đè và thay thế trực tiếp file cũ trên thiết bị của bạn:</span>
                 <ol className="list-decimal list-inside pl-1 space-y-0.5 font-medium text-blue-900">
                    <li>Chọn nút <b>"Giữ tên gốc"</b> ở phía trên.</li>
                    <li>Bấm nút <b>"Tải xuống PDF"</b> ở phía dưới.</li>
                    <li>Khi hộp thoại lưu của trình duyệt xuất hiện, chọn đúng thư mục chứa file cũ và bấm <b>Save (Lưu)</b> để ghi đè thành công.</li>
                 </ol>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                 <button 
                    className="px-4 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded text-xs transition-colors"
                    onClick={() => setShowExportModal(false)}
                 >
                    Hủy
                  </button>
                 <button 
                    className="px-5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded text-xs shadow transition-all"
                    onClick={() => {
                      exportToPDF(exportFilename);
                      setShowExportModal(false);
                    }}
                 >
                    Tải xuống PDF
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
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">4</div>
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
                                <strong className="text-gray-800">Tạo trường văn bản:</strong> Chọn công cụ <span className="inline-flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-medium text-xs text-gray-700"><Type className="w-3.5 h-3.5 text-blue-600" /> Trường văn bản</span> để kéo vẽ các vùng nhập liệu văn bản tương tác trực tiếp.
                             </div>
                          </li>
                          <li className="flex items-start gap-2">
                             <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 text-xs font-bold">3</div>
                             <div>
                                <strong className="text-gray-800">Đặt tên định danh cho vùng ký/trường văn bản:</strong> Click đúp hoặc nhấn vào tên chữ trên vùng vừa vẽ để đổi tên trực tiếp, hoặc chọn vùng đó rồi đổi tên ở <span className="font-semibold text-gray-800">Bảng thuộc tính phía bên phải</span> (ví dụ: đặt tên là <i>"ChuKyGiamDoc"</i>, <i>"NguoiKy1"</i>). Tên này sẽ lưu trữ chuẩn cấu trúc AcroForm của tài liệu PDF.
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

      {/* Top Header / Title Bar */}
      <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white shadow-md px-4 py-3 flex justify-between items-center z-10 relative">
        <span className="text-[15px] font-bold tracking-wide flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-100" />
            {documentName ? `${documentName} - ` : ''}Công cụ ký số PDF
            <span className="text-xs font-normal text-indigo-200 ml-2">Tác giả: Tuấn Anh-KH-QNPC</span>
        </span>
        {isProcessing && (
          <div className="flex items-center text-xs text-white bg-indigo-500 bg-opacity-40 px-3 py-1.5 rounded-full backdrop-blur-sm gap-2 shadow-inner border border-indigo-400">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-100" />
            <span className="font-medium">Đang xử lý PDF...</span>
          </div>
        )}
      </div>

      {isDigitallySigned && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-amber-800 text-xs font-medium z-10 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
             <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
             </span>
             <span>⚠️ <b>CẢNH BÁO CHỮ KÝ SỐ (Digital Signature detected):</b> Tài liệu này đã được ký số hợp lệ. Việc thêm/chỉnh sửa trường ký hoặc thay đổi cấu trúc trang (thêm, xóa, di chuyển trang) đã được khóa tự động để bảo toàn chữ ký điện tử gốc.</span>
          </div>
          <button 
             onClick={() => setIsDigitallySigned(false)} 
             className="text-amber-600 hover:text-amber-800 font-bold ml-4 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded bg-white shadow-xs transition-colors text-xs"
             title="Tạm thời tắt cảnh báo này"
          >
             Bỏ qua cảnh báo
          </button>
        </div>
      )}

      {/* Ribbon */}
      <div className="bg-gradient-to-b from-[#f8f9fa] to-[#f1f3f5] border-b border-gray-300 px-4 py-2 flex items-start space-x-6 z-0 shadow-sm min-h-[90px]">
        {/* File Group */}
        <div className="flex items-start space-x-1 relative pr-6 group/file">
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="flex flex-col items-center justify-start w-[68px] h-[68px] rounded-lg border border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group"
           >
             <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <FileUp className="w-6 h-6 text-indigo-600 z-10 drop-shadow-sm" strokeWidth={1.5} />
             <span className="text-[10px] font-medium leading-[1.1] text-center text-gray-700 z-10">Nhập PDF</span>
           </button>
           <button 
             onClick={() => appendFileInputRef.current?.click()}
             className="flex flex-col items-center justify-start w-[68px] h-[68px] rounded-lg border border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group"
             title="Thêm các trang từ file PDF khác vào cuối tài liệu này"
           >
             <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <FilePlus className="w-6 h-6 text-indigo-600 z-10 drop-shadow-sm" strokeWidth={1.5} />
             <span className="text-[10px] font-medium leading-[1.1] text-center text-gray-700 z-10">Thêm trang<br/>ở cuối</span>
           </button>
           <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-indigo-800/60 uppercase tracking-wider font-semibold">Tài liệu</div>
        </div>

        <div className="w-px h-16 bg-gray-300"></div>

        {/* Tools Group */}
        <div className="flex items-start space-x-1 relative pr-6">
           <RibbonButton icon={MousePointer2} label="Chọn" active={activeTool === 'Select'} onClick={() => setActiveTool('Select')} />
           <RibbonButton 
              icon={PenSquare} 
              label={"Trường\nchữ ký"} 
              active={activeTool === 'Signature Field'} 
              onClick={() => setActiveTool('Signature Field')}
           />
           <RibbonButton 
              icon={Type} 
              label={"Trường\nvăn bản"} 
              active={activeTool === 'Text Field'} 
              onClick={() => setActiveTool('Text Field')}
           />
           <RibbonButton 
              icon={Edit} 
              label={"Sửa chữ\ngốc"} 
              active={activeTool === 'Edit Text'} 
              onClick={() => setActiveTool('Edit Text')}
           />
           <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-gray-500 uppercase tracking-wider">Công cụ</div>
        </div>
        
        {activeTool === 'Edit Text' && (
           <>
             <div className="w-px h-16 bg-gray-300" />
             <div className="flex flex-col justify-center h-[68px] border border-orange-300/80 rounded-lg px-3 bg-orange-50/60 text-[11px] gap-1.5 shadow-inner relative overflow-hidden min-w-[200px]">
               <div className="flex items-center gap-1.5 font-semibold text-orange-700">
                 <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                 Chế độ sửa chữ gốc
               </div>
               <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-700">
                 <input 
                   type="checkbox" 
                   checked={showTextHighlights} 
                   onChange={(e) => setShowTextHighlights(e.target.checked)}
                   className="w-3 h-3 text-orange-500 border-gray-300 rounded focus:ring-orange-400 cursor-pointer"
                 />
                 <span className="text-[10px]">Hiện khung viền chữ</span>
               </label>
               {fontsLoading && (
                 <div className="flex items-center gap-1 text-[10px] text-indigo-600 animate-pulse font-medium">
                   <Loader2 className="w-3 h-3 animate-spin" />
                   <span>Đang tải phông chữ...</span>
                 </div>
               )}
               {fontsLoaded && (
                 <div className="text-[9px] text-green-600 font-semibold flex items-center gap-1">
                   <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                   <span>✓ Đã nạp phông tiếng Việt</span>
                 </div>
               )}
             </div>
           </>
        )}
        
        <div className="w-px h-16 bg-gray-300"></div>

        {/* Help Group */}
        <div className="flex items-start space-x-1 relative pr-6">
           <RibbonButton 
              icon={HelpCircle} 
              label={"Hướng dẫn\nsử dụng"} 
              active={showHelpModal} 
              onClick={() => setShowHelpModal(true)}
           />
           <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-gray-500 uppercase tracking-wider">Trợ giúp</div>
        </div>

        <div className="w-px h-16 bg-gray-300"></div>
        
        <div className="flex items-center h-[68px]">
             <button 
                onClick={() => {
                  if (!originalPdfBuffer) {
                    alert("Vui lòng nhập tài liệu PDF trước khi xuất.");
                    return;
                  }
                  setExportFilename(documentName);
                  setShowExportModal(true);
                }}
                className="flex flex-col items-center justify-center w-24 h-[68px] rounded border border-blue-500 bg-blue-50 hover:bg-blue-100 p-2 gap-1 text-blue-700 font-bold transition-colors shadow-sm ml-4"
              >
                <FileDown className="w-6 h-6" />
                <span className="text-[10px] leading-tight text-center">Xuất file PDF</span>
             </button>
        </div>
      </div>

      {/* Below Ribbon - Document Tabs */}
      <div className="bg-[#f0f0f0] border-b border-gray-300 flex text-xs px-2 pt-1 h-7">
         <div className="bg-white border text-gray-700 border-gray-300 border-b-0 px-4 py-1 rounded-t flex items-center gap-2 relative top-[1px]">
            {documentName} <X className="w-3 h-3 hover:text-red-500 cursor-pointer" />
         </div>
      </div>

      {/* Horizontal Split Layout: Scrollable Canvas on the Left, Style Panel on the Right */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Floating Indicator for Continuous Mode */}
        {(activeTool === 'Signature Field' || activeTool === 'Text Field') && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-900/95 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md border border-indigo-500/30 animate-bounce z-50">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Đang ở chế độ tạo liên tục {activeTool === 'Signature Field' ? 'trường chữ ký' : 'trường văn bản'} (Nhấn <kbd className="bg-indigo-700 px-1.5 py-0.5 rounded text-[10px] border border-indigo-500 font-mono">ESC</kbd> hoặc nút <b>Chọn</b> để thoát)
            </span>
          </div>
        )}

        {/* Main Workspace Workspace */}
        <div className="flex-1 bg-[#8c8c8c] overflow-auto p-12 flex flex-col items-center gap-6 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] relative" onScroll={handleScroll}>
        
        {pages.length === 0 ? (
          /* Placeholder Page */
          <div 
             className={`bg-white shadow-xl w-[800px] h-[1131px] relative transition-all flex-shrink-0 ${
               activeTool === 'Signature Field' ? 'cursor-crosshair' : 'cursor-default'
             }`}
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
              {renderDrawingBox(0)}
          </div>
        ) : (
          /* Render Extracted Pages */
          pages.map((p, i) => {
             const isPageSelected = selectedPageIndices.includes(i);
             return (
              <div key={i} className="flex flex-row items-stretch relative group">
                   {/* Page Selection Checkbox */}
                   {!isDigitallySigned && (
                      <div className={`absolute top-4 left-4 z-50 transition-all ${isPageSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                         <input 
                            type="checkbox"
                            checked={isPageSelected}
                            onChange={(e) => {
                               if (e.target.checked) {
                                  setSelectedPageIndices([...selectedPageIndices, i]);
                               } else {
                                  setSelectedPageIndices(selectedPageIndices.filter(idx => idx !== i));
                               }
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shadow-md cursor-pointer bg-white"
                         />
                      </div>
                   )}

                   {/* Page Controls (shown on hover) */}
                   <div className="absolute -left-12 top-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
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
                     className={`bg-white shadow-xl relative transition-all duration-200 flex-shrink-0 ${
                       (activeTool === 'Signature Field' || activeTool === 'Text Field') ? 'cursor-crosshair' : 'cursor-default'
                     } ${isPageSelected ? 'ring-4 ring-indigo-500 ring-offset-2 scale-[1.01] z-30' : ''}`}
                     style={{ width: p.width, height: p.height }}
                     onMouseDown={(e) => handleMouseDown(e, i)}
                   >
                      <img src={p.dataUrl} className="w-full h-full pointer-events-none" alt={`Trang ${i+1}`} />
                      {renderFields(i)}
                      {renderPdfTexts(i)}
                      {renderDrawingBox(i)}
                   </div>
              </div>
             );
          })
        )}

        {/* Floating Page Indicator */}
        {pages.length > 0 && (
           <div 
              className="fixed bottom-6 bg-[#0f205c] bg-opacity-90 text-white px-5 py-2.5 rounded-full shadow-2xl z-[100] flex items-center gap-4 border border-[#2b3c7c] transition-all duration-200"
              style={{ right: selectedTextId ? '344px' : '24px' }}
           >
              <button 
                  onClick={() => {
                     const el = document.getElementById(`page-${currentPage - 2}`);
                     if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage <= 1}
                  className="hover:text-blue-300 disabled:opacity-30 disabled:hover:text-white transition-colors"
                  aria-label="Previous Page"
              >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="text-sm font-semibold select-none whitespace-nowrap">Trang {currentPage} / {pages.length}</span>
              <button 
                  onClick={() => {
                     const el = document.getElementById(`page-${currentPage}`);
                     if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  disabled={currentPage >= pages.length}
                  className="hover:text-blue-300 disabled:opacity-30 disabled:hover:text-white transition-colors"
                  aria-label="Next Page"
              >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
           </div>
        )}

        {/* Floating Action Bar for Multi-Page Management */}
        {selectedPageIndices.length > 0 && (
           <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 text-gray-800 px-6 py-3 rounded-2xl shadow-2xl z-[100] flex items-center gap-5 border-indigo-100 animate-fade-in">
              <div className="flex items-center gap-2">
                 <div className="bg-indigo-100 text-indigo-700 w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">
                    {selectedPageIndices.length}
                 </div>
                 <span className="text-xs font-semibold text-gray-700">trang đã chọn</span>
              </div>
              
              <div className="h-6 w-px bg-gray-200" />
              
              <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-500 font-medium">Di chuyển đến trước trang:</span>
                 <select 
                    onChange={(e) => {
                       const targetVal = parseInt(e.target.value);
                       if (!isNaN(targetVal)) {
                          handleMoveMultiplePages(selectedPageIndices, targetVal);
                       }
                    }}
                    value=""
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-1.5 cursor-pointer font-medium"
                 >
                    <option value="" disabled>Chọn trang đích...</option>
                    {pages.map((_, idx) => {
                       if (selectedPageIndices.includes(idx)) return null;
                       return (
                          <option key={idx} value={idx}>Trang {idx + 1}</option>
                       );
                    })}
                    {!selectedPageIndices.includes(pages.length) && (
                       <option value={pages.length}>Cuối tài liệu</option>
                    )}
                 </select>
              </div>

              <div className="h-6 w-px bg-gray-200" />

              <button 
                 onClick={() => handleDeleteMultiplePages(selectedPageIndices)}
                 className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-semibold bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors cursor-pointer"
              >
                 <Trash2 className="w-4 h-4" />
                 Xóa trang
              </button>

              <button 
                 onClick={() => setSelectedPageIndices([])}
                 className="text-xs text-gray-500 hover:text-gray-700 font-medium hover:underline"
              >
                 Hủy chọn
              </button>
           </div>
         )}

        </div>

        {/* Formatting Sidebar Panel */}
        {renderFormattingSidebar()}
      </div>
    </div>
  );

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
              e.stopPropagation();
              setSelectedFieldId(f.id);
              if (activeTool === 'Select') {
                const pageElement = (e.currentTarget as HTMLElement).closest('.relative.flex-shrink-0') as HTMLDivElement;
                if (pageElement) {
                    const rect = pageElement.getBoundingClientRect();
                    const startX = e.clientX - rect.left;
                    const startY = e.clientY - rect.top;
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
                         <PenSquare className="w-5 h-5 text-indigo-600 pointer-events-none" />
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
                                 className="text-[11px] font-bold text-indigo-700 text-center bg-white border border-indigo-300 rounded px-1 py-0.5 w-full outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                             />
                         ) : (
                             <span className="text-[11px] font-bold text-indigo-700 leading-none truncate max-w-full">{f.name}</span>
                         )}
                     </>
                 )}
             </div>
             
             {/* Corner Handles for resizing */}
             {isSelected && activeTool === 'Select' && (
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
             <button 
               onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
               className="absolute -top-2 -right-2 bg-white text-red-600 border border-red-200 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-700 cursor-pointer shadow z-20 transition-all duration-150"
               title={isText ? "Xóa trường văn bản" : "Xóa trường chữ ký"}
             >
                 <X className="w-3 h-3 stroke-[2.5]" />
             </button>
             
             {/* Properties Popup Wrapper */}
             {isSelected && activeTool === 'Select' && (
                 <div className="absolute left-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-md p-2.5 shadow-lg z-50 text-[11px] font-sans text-gray-800 cursor-default w-[220px]"
                  onMouseDown={(e) => e.stopPropagation()}
                 >
                     <div className="flex flex-col gap-2">
                         {isText ? (
                             <>
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
                             </>
                         ) : (
                             <div className="flex flex-col gap-1">
                                 <span className="font-semibold text-gray-700">Tên trường chữ ký:</span>
                                 <input 
                                    type="text" 
                                    value={f.name} 
                                    onChange={(e) => {
                                      setFields(fields.map(field => field.id === f.id ? { ...field, name: e.target.value } : field));
                                    }}
                                    className={`w-full border border-gray-300 rounded px-2 py-1 outline-none bg-white ${focusRingClass}`}
                                 />
                             </div>
                         )}
                     </div>
                 </div>
             )}
         </div>
     )});
  }

  function renderDrawingBox(pageIndex: number) {
    if (!drawing || drawing.pageIndex !== pageIndex) return null;
    const isText = activeTool === 'Text Field';
    const borderClass = isText ? 'border-blue-600 bg-blue-50' : 'border-indigo-600 bg-indigo-50';
    const labelBg = isText ? 'bg-blue-600' : 'bg-indigo-600';
    const label = isText ? 'Trường văn bản' : 'Trường chữ ký';
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
        <div className={`absolute top-0 left-0 ${labelBg} text-white text-[10px] px-1.5 py-0.5 whitespace-nowrap transform -translate-y-[calc(100%+1px)] -translate-x-[1px] leading-none rounded-t`}>
          {label}
        </div>
      </div>
    );
  }

  /** Cập nhật thuộc tính của text item mà không đóng inline edit */
  const handleUpdateText = (id: string, updates: Partial<PdfTextItem>) => {
    setPdfTexts(prev => prev.map(t => t.id === id ? { ...t, ...updates, isModified: true } : t));
  };

  /** Floating format bar nổi ngay trên text đang edit, giống Foxit */
  function renderFloatingFormatBar(t: PdfTextItem, baselineX: number, bottomOffsetForBaseline: number) {
    const handlePropChange = (updates: Partial<PdfTextItem>) => handleUpdateText(t.id, updates);
    const detectedFont = (t.fontName || '').replace(/^[A-Z]{6}\+/, '') || 'Auto';
    const fontSize = Math.round(t.customFontSize || t.fontSize);
    return (
      <div
        data-floating-bar="true"
        className="absolute z-[60] flex items-center gap-0.5 bg-white border border-gray-300 shadow-xl rounded-lg px-2 py-1 select-none"
        style={{
          left: baselineX,
          bottom: bottomOffsetForBaseline + (t.customFontSize || t.fontSize) * 1.5 + 8,
          minWidth: 280,
          whiteSpace: 'nowrap'
        }}
        onMouseDown={(e) => {
          // Ngăn mất focus của contentEditable khi nhấp chuột vào các nút định dạng
          e.preventDefault();
        }}
      >
        {/* Dropdown chọn phông chữ nhanh hỗ trợ tự sửa phông sai */}
        <select
          value={t.customFontFamily || ''}
          onChange={(e) => handlePropChange({ customFontFamily: e.target.value || undefined })}
          className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 text-gray-700 outline-none font-semibold cursor-pointer max-w-[110px]"
          title={`Font gốc: ${detectedFont}. Chọn phông chữ khác nếu tự động nhận dạng bị sai.`}
        >
          <option value="">Tự động ({detectedFont.slice(0, 8)})</option>
          <option value="sans-serif">Arial (Không chân)</option>
          <option value="serif">Times New Roman (Có chân)</option>
          <option value="monospace">Courier New (Mã máy)</option>
        </select>

        {/* Cỡ chữ */}
        <input
          type="number"
          min={4} max={150} step={1}
          value={fontSize}
          onChange={(e) => handlePropChange({ customFontSize: parseInt(e.target.value) || t.fontSize })}
          className="w-10 text-center border border-gray-200 rounded text-[11px] py-0.5 outline-none focus:border-blue-400 bg-white font-mono"
        />

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Bold */}
        <button
          tabIndex={-1}
          onClick={() => handlePropChange({ isBold: !t.isBold })}
          className={`p-1 rounded transition-colors ${
            t.isBold ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-gray-100 text-gray-600'
          }`}
          title="In đậm (Bold)"
        >
          <Bold className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Italic */}
        <button
          tabIndex={-1}
          onClick={() => handlePropChange({ isItalic: !t.isItalic })}
          className={`p-1 rounded transition-colors ${
            t.isItalic ? 'bg-indigo-100 text-indigo-700 italic' : 'hover:bg-gray-100 text-gray-600'
          }`}
          title="In nghiêng (Italic)"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Màu sắc */}
        <label className="flex items-center gap-1 cursor-pointer" title="Màu chữ">
          <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: t.customColor || '#000000' }} />
          <input
            type="color"
            value={t.customColor || '#000000'}
            onChange={(e) => handlePropChange({ customColor: e.target.value })}
            className="absolute opacity-0 w-0 h-0"
          />
        </label>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Xóa đè nền */}
        <button
          tabIndex={-1}
          onClick={() => handlePropChange({ hasBackground: t.hasBackground === false })}
          className={`p-1 rounded text-[10px] font-semibold transition-colors ${
            t.hasBackground !== false ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100 text-gray-500'
          }`}
          title="Che vùng chữ cũ bên dưới"
        >
          Che nền
        </button>

        <div className="w-px h-4 bg-gray-200 mx-0.5" />

        {/* Mở sidebar định dạng nâng cao */}
        <button
          tabIndex={-1}
          onClick={() => setSelectedTextId(t.id)}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 flex items-center gap-1"
          title="Định dạng nâng cao (căn lề, vị trí, góc xoay)..."
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span className="text-[10px]">Thêm</span>
        </button>

        {/* Đóng chỉnh sửa */}
        <button
          tabIndex={-1}
          onClick={() => { setEditingTextId(null); setSelectedTextId(null); }}
          className="ml-1 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
          title="Đóng (Esc)"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  /** Render tất cả văn bản PDF (cả chữ gốc và chữ đã sửa) trên một trang */
  function renderPdfTexts(pageIndex: number) {
    const isEditMode = activeTool === 'Edit Text';

    return pdfTexts
      .filter(t => t.pageIndex === pageIndex)
      .map(t => {
        const isEditing = editingTextId === t.id;
        const isModified = t.isModified;

        // Nếu không ở chế độ sửa và chữ này chưa bị chỉnh sửa, không cần vẽ đè lên canvas
        if (!isEditMode && !isModified) return null;

        const fontFamily = getFontFamily(t.customFontFamily || t.fontName);
        const fontStyle = t.isItalic ? 'italic' : 'normal';
        const fontWeight = t.isBold ? 'bold' : 'normal';
        const customColor = t.customColor || '#000000';
        const hasBg = t.hasBackground !== false;

        const pageHeight = pages[pageIndex]?.height || 800;
        const sizeToUse = (t.customFontSize || t.fontSize) * 1.5;

        // Vị trí chữ
        const baselineX = t.x + (t.offsetX || 0);
        const baselineY = t.y + t.height + (t.offsetY || 0);
        const bottomOffset = pageHeight - baselineY;
        const descenderShift = sizeToUse * 0.31;
        const bottomOffsetForBaseline = bottomOffset - descenderShift;

        // Trạng thái hiển thị chữ:
        // - Nếu đang sửa hoặc đã sửa đổi -> hiển thị màu thật, có nền trắng đè lên canvas để xóa chữ cũ
        // - Nếu chưa sửa và chưa edit -> hiển thị trong suốt (color: transparent) để người dùng thấy chữ thật của canvas ở dưới nhưng vẫn click chuột được vào đúng ký tự
        const shouldShowReal = isEditing || isModified;
        const textColor = shouldShowReal ? customColor : 'transparent';
        const bgColor = (shouldShowReal && hasBg) ? 'white' : 'transparent';

        const textStyle: React.CSSProperties = {
          fontSize: `${sizeToUse}px`,
          fontFamily,
          fontStyle,
          fontWeight,
          color: textColor,
          backgroundColor: bgColor,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          display: 'inline-block',
        };

        // Bounding box viền nét đứt khi hover giống Foxit
        const borderStyle = isEditMode
          ? (isEditing
              ? '2px solid #3b82f6'
              : (showTextHighlights ? '1px dashed #f97316' : 'none'))
          : 'none';

        return (
          <React.Fragment key={t.id}>
            {/* Thanh công cụ nổi phía trên chữ đang edit */}
            {isEditing && renderFloatingFormatBar(t, baselineX, bottomOffsetForBaseline)}

            <div
              contentEditable={isEditMode}
              suppressContentEditableWarning
              spellCheck={false}
              className={`absolute select-text z-30 transition-all ${
                isEditMode ? 'cursor-text hover:bg-orange-200/10' : ''
              }`}
              style={{
                left: baselineX,
                bottom: bottomOffsetForBaseline,
                ...textStyle,
                transform: `rotate(${t.rotation || 0}deg)`,
                transformOrigin: 'left bottom',
                outline: borderStyle,
                outlineOffset: '2px',
                minWidth: isEditing ? `${Math.max(t.width, 30)}px` : undefined,
                minHeight: isEditing ? `${sizeToUse * 1.3}px` : undefined,
              }}
              onMouseDown={(e) => {
                if (isEditMode) {
                  e.stopPropagation();
                }
              }}
              onClick={(e) => {
                if (isEditMode) {
                  e.stopPropagation();
                  // Kích hoạt edit mode nếu chưa kích hoạt
                  if (editingTextId !== t.id) {
                    setEditingTextId(t.id);
                    ensureFontsLoaded();
                    if (!t.isModified) {
                      // Đánh dấu đã modified để vẽ nền trắng xóa chữ gốc ngay lập tức
                      setPdfTexts(prev => prev.map(item =>
                        item.id === t.id ? { ...item, isModified: true } : item
                      ));
                    }
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingTextId(null);
                  setSelectedTextId(null);
                }
              }}
              onBlur={(e) => {
                // Nếu click vào floating bar thì không lưu/blur
                if ((e.relatedTarget as HTMLElement)?.closest?.('[data-floating-bar="true"]')) {
                  e.preventDefault();
                  return;
                }
                const newText = e.currentTarget.innerText.replace(/\n/g, ' ').trim();
                handleSaveTextEdit(t.id, newText || t.text);
              }}
              // Render chữ trực tiếp để trình duyệt xác định caret position chuẩn xác
              dangerouslySetInnerHTML={{ __html: t.text }}
            />
          </React.Fragment>
        );
      });
  }

  function RibbonButton({ icon: Icon, label, active, onClick, className = '' }: any) {
    const lines = label.split('\n');
    return (
      <button 
        onClick={onClick}
        className={`flex flex-col items-center justify-start w-[68px] h-[68px] rounded-lg border ${active ? 'bg-indigo-50 border-indigo-300 shadow-inner' : 'border-transparent hover:bg-white hover:border-indigo-200 hover:shadow-sm'} p-1 pt-1.5 gap-1 transition-all relative overflow-hidden group ${className}`}
      >
        {!active && <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity z-0"></div>}
        <Icon className={`w-6 h-6 z-10 ${active ? 'text-indigo-700 drop-shadow-sm' : 'text-gray-700 group-hover:text-indigo-600'}`} strokeWidth={1.5} />
        <span className={`text-[10px] whitespace-normal font-medium leading-[1.1] text-center z-10 ${active ? 'text-indigo-800' : 'text-gray-700'}`}>
           {lines.map((l: string, i: number) => <React.Fragment key={i}>{l}{i < lines.length - 1 && <br/>}</React.Fragment>)}
        </span>
      </button>
    );
  }
}
