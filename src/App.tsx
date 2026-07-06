/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { 
  PenSquare, Layout, FileDown, X, MousePointer2, FileUp, Loader2, FilePlus, Trash2
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfLib from 'pdf-lib';
import { PDFDocument } from 'pdf-lib';

// Configure pdfjs worker url
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Field = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'signature';
  name: string;
};

type PdfPage = {
  width: number;
  height: number;
  dataUrl: string;
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

  const renderPdfPages = async (buffer: ArrayBuffer | Uint8Array) => {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const parsedPages: PdfPage[] = [];
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
    }
    setPages(parsedPages);
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

  const handleMouseDown = (e: React.MouseEvent, pageIndex: number) => {
    if (activeTool === 'Select') {
      setSelectedFieldId(null);
      return;
    }
    if (activeTool !== 'Signature Field') return;
    
    setSelectedFieldId(null);
    const pageElement = e.currentTarget as HTMLDivElement;
    const rect = pageElement.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawing({ pageIndex, startX: x, startY: y, currentX: x, currentY: y });
  };

  const handleResizeDown = (e: React.MouseEvent, f: Field, type: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
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
      width = 120;
      height = 50;
    }
    
    if (width > 5 && height > 5) {
      const newId = Math.random().toString(36).substring(2, 9);
      const defaultName = `Signature${fields.filter(f => f.type === 'signature').length + 1}`;
      
      setFields([...fields, {
        id: newId,
        pageIndex: drawing.pageIndex,
        x, y, width, height,
        type: 'signature',
        name: defaultName,
      }]);
      setSelectedFieldId(newId);
      setActiveTool('Select');
    }
    
    setDrawing(null);
  };

  const deleteField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const exportToPDF = async () => {
    if (!originalPdfBuffer) {
      alert("Vui lòng nhập tài liệu PDF trước khi xuất.");
      return;
    }
    
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(originalPdfBuffer);
      const form = pdfDoc.getForm();
      const pdfPages = pdfDoc.getPages();
      
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
      a.download = documentName.replace('.pdf', '') + '_co_vung_ky.pdf';
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
           <div className="absolute -bottom-1 -mx-2 w-[calc(100%+16px)] text-center text-[10px] text-gray-500 uppercase tracking-wider">Công cụ</div>
        </div>
        
        <div className="w-px h-16 bg-gray-300"></div>
        
        <div className="flex items-center h-[68px]">
             <button 
                onClick={exportToPDF}
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
          pages.map((p, i) => (
             <div key={i} className="flex flex-row items-stretch relative group">
                  {/* Page Controls (shown on hover) */}
                  <div className="absolute -left-12 top-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                      <button title="Chèn PDF vào trước trang này" onClick={() => { setInsertTargetIndex(i); insertFileInputRef.current?.click(); }} className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-green-600"><FilePlus className="w-4 h-4" /></button>
                      <button title="Xóa trang này" onClick={() => setDeletePageConfirm({index: i, dataUrl: p.dataUrl})} className="p-1.5 bg-white border border-gray-300 rounded shadow hover:bg-gray-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  <div 
                    id={`page-${i}`}
                    className={`bg-white shadow-xl relative transition-all flex-shrink-0 ${
                      activeTool === 'Signature Field' ? 'cursor-crosshair' : 'cursor-default'
                    }`}
                    style={{ width: p.width, height: p.height }}
                    onMouseDown={(e) => handleMouseDown(e, i)}
                  >
                     <img src={p.dataUrl} className="w-full h-full pointer-events-none" alt={`Trang ${i+1}`} />
                     {renderFields(i)}
                     {renderDrawingBox(i)}
                  </div>
             </div>
          ))
        )}

        {/* Floating Page Indicator */}
        {pages.length > 0 && (
           <div className="fixed bottom-6 right-6 bg-[#0f205c] bg-opacity-90 text-white px-5 py-2.5 rounded-full shadow-2xl z-[100] flex items-center gap-4 border border-[#2b3c7c]">
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

      </div>
    </div>
  );
  
  function renderFields(pageIndex: number) {
     return fields.filter(f => f.pageIndex === pageIndex).map(f => {
         const isSelected = f.id === selectedFieldId;
         const bgClass = 'bg-indigo-50/90 border-indigo-500 hover:bg-indigo-100/90';
         const borderClass = isSelected ? 'border-2 border-indigo-600 z-50 shadow-md' : 'border border-dashed border-indigo-400 hover:border-indigo-600';

         return (
         <div 
           key={f.id}
           className={`absolute group ${borderClass} ${bgClass} ${activeTool === 'Select' ? 'cursor-move' : ''} rounded transition-all duration-150`}
           style={{ left: f.x, top: f.y, width: f.width, height: f.height }}
           onMouseDown={(e) => {
              if (activeTool === 'Select') {
                e.stopPropagation();
                setSelectedFieldId(f.id);
                
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
             {/* Signature Icon & Text */}
             <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center select-none pointer-events-none gap-0.5">
                 <PenSquare className="w-5 h-5 text-indigo-600" />
                 <span className="text-[11px] font-bold text-indigo-700 leading-none truncate max-w-full">{f.name}</span>
             </div>
             
             {/* Corner Handles for resizing */}
             {isSelected && activeTool === 'Select' && (
                 <>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'nw')} className="absolute top-0 left-0 w-1.5 h-1.5 bg-indigo-600 transform -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border border-white rounded-full z-10"></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'n')} className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-indigo-600 transform -translate-x-1/2 -translate-y-1/2 cursor-ns-resize border border-white rounded-full z-10"></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'ne')} className="absolute top-0 right-0 w-1.5 h-1.5 bg-indigo-600 transform translate-x-1/2 -translate-y-1/2 cursor-nesw-resize border border-white rounded-full z-10"></div>
                     
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'w')} className="absolute top-1/2 left-0 w-1.5 h-1.5 bg-indigo-600 transform -translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-white rounded-full z-10"></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'e')} className="absolute top-1/2 right-0 w-1.5 h-1.5 bg-indigo-600 transform translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-white rounded-full z-10"></div>
                     
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'sw')} className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-indigo-600 transform -translate-x-1/2 translate-y-1/2 cursor-nesw-resize border border-white rounded-full z-10"></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 's')} className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-indigo-600 transform -translate-x-1/2 translate-y-1/2 cursor-ns-resize border border-white rounded-full z-10"></div>
                     <div onMouseDown={(e) => handleResizeDown(e, f, 'se')} className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-indigo-600 transform translate-x-1/2 translate-y-1/2 cursor-nwse-resize border border-white rounded-full z-10"></div>
                 </>
             )}

             {/* Delete Action Button */}
             <button 
               onClick={(e) => { e.stopPropagation(); deleteField(f.id); }}
               className="absolute -top-2 -right-2 bg-white text-red-600 border border-red-200 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-700 cursor-pointer shadow z-20 transition-all duration-150"
               title="Xóa trường chữ ký"
             >
                 <X className="w-3 h-3 stroke-[2.5]" />
             </button>
             
             {/* Properties Popup Wrapper */}
             {isSelected && activeTool === 'Select' && (
                 <div className="absolute left-0 top-[calc(100%+4px)] bg-white border border-gray-200 rounded-md p-2.5 shadow-lg z-50 text-[11px] font-sans text-gray-800 cursor-default w-[220px]"
                  onMouseDown={(e) => e.stopPropagation()}
                 >
                     <div className="flex flex-col gap-2">
                         <div className="flex flex-col gap-1">
                             <span className="font-semibold text-gray-700">Tên trường chữ ký:</span>
                             <input 
                                type="text" 
                                value={f.name} 
                                onChange={(e) => {
                                  setFields(fields.map(field => field.id === f.id ? { ...field, name: e.target.value } : field));
                                }}
                                className="w-full border border-gray-300 rounded px-2 py-1 outline-none bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                             />
                         </div>
                         
                     </div>
                 </div>
             )}
         </div>
     )});
  }

  function renderDrawingBox(pageIndex: number) {
     if (!drawing || drawing.pageIndex !== pageIndex) return null;
     return (
        <div 
           className="absolute border border-indigo-600 border-dashed bg-indigo-50 bg-opacity-40"
           style={{ 
               left: Math.min(drawing.startX, drawing.currentX), 
               top: Math.min(drawing.startY, drawing.currentY), 
               width: Math.abs(drawing.currentX - drawing.startX), 
               height: Math.abs(drawing.currentY - drawing.startY) 
           }}
        >
              {/* Tab Header Preview */}
              <div className="absolute top-0 left-0 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 whitespace-nowrap transform -translate-y-[calc(100%+1px)] -translate-x-[1px] leading-none rounded-t">
                  Trường chữ ký
              </div>
        </div>
     );
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
