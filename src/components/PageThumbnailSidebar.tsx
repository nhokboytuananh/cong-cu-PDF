import React, { useState } from 'react';
import { 
  Trash2, RotateCcw, RotateCw, ArrowUp, ArrowDown, FilePlus, X, CheckSquare, Square, Check, Lock
} from 'lucide-react';
import { PdfPage, Field } from '../types';

interface PageThumbnailSidebarProps {
  pages: PdfPage[];
  fields: Field[];
  currentPage: number;
  selectedPageIndices: number[];
  onSelectPages: (indices: number[], anchorIndex?: number) => void;
  lastSelectedPageIndex: number | null;
  onScrollToPage: (index: number) => void;
  onDeletePages: (indices: number[]) => void;
  onMovePages: (sourceIndices: number[], targetIndex: number) => void;
  onRotatePages: (indices: number[], deltaDegrees: number) => void;
  onAddPageClick: () => void;
  onClose: () => void;
  isDigitallySigned: boolean;
}

export const PageThumbnailSidebar: React.FC<PageThumbnailSidebarProps> = ({
  pages,
  fields,
  currentPage,
  selectedPageIndices,
  onSelectPages,
  lastSelectedPageIndex,
  onScrollToPage,
  onDeletePages,
  onMovePages,
  onRotatePages,
  onAddPageClick,
  onClose,
  isDigitallySigned,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');

  const hasSelection = selectedPageIndices.length > 0;
  const allSelected = pages.length > 0 && selectedPageIndices.length === pages.length;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      onSelectPages([]);
    } else {
      const all = pages.map((_, i) => i);
      onSelectPages(all, 0);
    }
  };

  const handleThumbnailClick = (e: React.MouseEvent, index: number) => {
    // 1. SHIFT + CLICK: Select contiguous range between anchor and clicked index
    if (e.shiftKey) {
      const anchor = lastSelectedPageIndex !== null ? lastSelectedPageIndex : (selectedPageIndices[0] ?? index);
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      const range: number[] = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      if (e.ctrlKey || e.metaKey) {
        // Union with current selection
        const union = Array.from(new Set([...selectedPageIndices, ...range]));
        onSelectPages(union, index);
      } else {
        // Direct range selection
        onSelectPages(range, index);
      }
    } 
    // 2. CTRL + CLICK (or CMD + CLICK): Toggle individual page
    else if (e.ctrlKey || e.metaKey) {
      if (selectedPageIndices.includes(index)) {
        onSelectPages(selectedPageIndices.filter((i) => i !== index), index);
      } else {
        onSelectPages([...selectedPageIndices, index], index);
      }
    } 
    // 3. NORMAL CLICK: Select single page & scroll view to it
    else {
      onSelectPages([index], index);
      onScrollToPage(index);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isDigitallySigned) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isDigitallySigned) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'before' : 'after';

    setDragOverIndex(index);
    setDropPosition(pos);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (isDigitallySigned || draggedIndex === null) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const effectiveTarget = dropPosition === 'before' ? targetIndex : targetIndex + 1;

    // If dragged item is part of selected pages, move all selected pages
    if (selectedPageIndices.includes(draggedIndex)) {
      onMovePages(selectedPageIndices, effectiveTarget);
    } else {
      onMovePages([draggedIndex], effectiveTarget);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMoveSelected = (direction: 'up' | 'down') => {
    if (selectedPageIndices.length === 0 || isDigitallySigned) return;
    const sorted = [...selectedPageIndices].sort((a, b) => a - b);
    if (direction === 'up') {
      const minIdx = sorted[0];
      if (minIdx <= 0) return;
      onMovePages(sorted, minIdx - 1);
    } else {
      const maxIdx = sorted[sorted.length - 1];
      if (maxIdx >= pages.length - 1) return;
      onMovePages(sorted, maxIdx + 2);
    }
  };

  return (
    <div className="w-[240px] flex-shrink-0 bg-[#f8f9fa] border-r border-gray-300 flex flex-col h-full select-none z-30 shadow-md">
      {/* Sidebar Header */}
      <div className="px-3 py-2.5 bg-gradient-to-r from-gray-100 to-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-gray-800 tracking-wide uppercase">
            TRANG
          </span>
          <span className="text-[11px] font-semibold text-gray-500 bg-gray-200/80 px-1.5 py-0.5 rounded-full">
            {pages.length}
          </span>
          {hasSelection && (
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-full">
              Đã chọn: {selectedPageIndices.length}
            </span>
          )}
          {isDigitallySigned && (
            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5" title="Tài liệu đã ký số - Chế độ chỉ đọc">
              <Lock className="w-3 h-3 text-amber-700" />
              Khóa
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Đóng bảng trang"
          className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="px-2 py-1.5 bg-white border-b border-gray-200 flex items-center justify-between gap-1 shadow-xs">
        <div className="flex items-center gap-1">
          {/* Add Page */}
          <button
            type="button"
            onClick={onAddPageClick}
            disabled={isDigitallySigned}
            title={isDigitallySigned ? "Tài liệu đã ký số (không thể chèn thêm trang)" : "Thêm các trang từ tệp PDF khác"}
            className="p-1 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <FilePlus className="w-4 h-4" />
          </button>

          {/* Delete Selected Pages */}
          <button
            type="button"
            onClick={() => {
              if (hasSelection) onDeletePages(selectedPageIndices);
            }}
            disabled={!hasSelection || isDigitallySigned}
            title={
              isDigitallySigned
                ? 'Tài liệu đã ký số (không thể xóa trang)'
                : hasSelection
                ? `Xóa ${selectedPageIndices.length} trang đã chọn`
                : 'Chọn trang để xóa'
            }
            className="p-1 text-red-600 hover:bg-red-50 hover:text-red-800 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-0.5" />

          {/* Rotate CCW */}
          <button
            type="button"
            onClick={() => {
              const targets = hasSelection ? selectedPageIndices : [currentPage - 1];
              onRotatePages(targets, -90);
            }}
            disabled={pages.length === 0 || isDigitallySigned}
            title="Xoay ngược chiều kim đồng hồ 90°"
            className="p-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Rotate CW */}
          <button
            type="button"
            onClick={() => {
              const targets = hasSelection ? selectedPageIndices : [currentPage - 1];
              onRotatePages(targets, 90);
            }}
            disabled={pages.length === 0 || isDigitallySigned}
            title="Xoay theo chiều kim đồng hồ 90°"
            className="p-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-0.5" />

          {/* Move Up */}
          <button
            type="button"
            onClick={() => handleMoveSelected('up')}
            disabled={!hasSelection || isDigitallySigned}
            title="Di chuyển trang lên"
            className="p-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          {/* Move Down */}
          <button
            type="button"
            onClick={() => handleMoveSelected('down')}
            disabled={!hasSelection || isDigitallySigned}
            title="Di chuyển trang xuống"
            className="p-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 rounded transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Select All Toggle */}
        <button
          type="button"
          onClick={handleToggleSelectAll}
          title={allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả các trang (Ctrl+A)'}
          className="p-1 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 rounded transition-colors"
        >
          {allSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
        </button>
      </div>

      {/* Keyboard instructions tip */}
      <div className="px-3 py-1 bg-indigo-50/50 border-b border-indigo-100/60 text-[10px] text-gray-500 flex items-center justify-between">
        <span>
          <kbd className="bg-white border border-gray-300 px-1 py-0.2 rounded font-sans text-[9px] font-semibold text-gray-700">Shift</kbd> chọn liên tiếp, <kbd className="bg-white border border-gray-300 px-1 py-0.2 rounded font-sans text-[9px] font-semibold text-gray-700">Ctrl</kbd> chọn lẻ
        </span>
      </div>

      {/* Thumbnails Scrollable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {pages.length === 0 ? (
          <div className="text-center py-10 px-2 text-gray-400 text-xs">
            <p>Chưa có trang PDF nào.</p>
            <p className="mt-1 text-[11px]">Hãy mở một file PDF để bắt đầu.</p>
          </div>
        ) : (
          pages.map((p, i) => {
            const isSelected = selectedPageIndices.includes(i);
            const isCurrentInView = currentPage === i + 1;
            const pageFields = fields.filter((f) => f.pageIndex === i);
            const hasSignatureField = pageFields.some((f) => f.type === 'signature');
            const hasTextField = pageFields.some((f) => f.type === 'text');

            const isDragOverThis = dragOverIndex === i;

            return (
              <div
                key={i}
                draggable={!isDigitallySigned}
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, i)}
                className="relative group/thumb"
              >
                {/* Drop Indicator (Before) */}
                {isDragOverThis && dropPosition === 'before' && (
                  <div className="absolute -top-2 left-0 right-0 h-1 bg-indigo-600 rounded-full z-40 shadow-sm" />
                )}

                {/* Thumbnail Card */}
                <div
                  onClick={(e) => handleThumbnailClick(e, i)}
                  className={`relative rounded-lg border-2 p-1.5 transition-all cursor-pointer bg-white ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 shadow-md ring-2 ring-indigo-200'
                      : isCurrentInView
                      ? 'border-blue-400 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-xs'
                  } ${draggedIndex === i ? 'opacity-40' : 'opacity-100'}`}
                >
                  {/* Selection Checkmark Badge */}
                  <div
                    className={`absolute top-2.5 right-2.5 z-20 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-white/90 border border-gray-300 text-transparent opacity-0 group-hover/thumb:opacity-100 hover:border-indigo-500'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>

                  {/* Digitally Signed Lock indicator */}
                  {isDigitallySigned && (
                    <div
                      className="absolute top-2.5 left-2.5 z-20 bg-amber-500 text-white p-1 rounded shadow-xs"
                      title="Trang thuộc tài liệu đã ký số"
                    >
                      <Lock className="w-3 h-3" />
                    </div>
                  )}

                  {/* Thumbnail Image Container */}
                  <div className="w-full aspect-[1/1.414] bg-gray-100 rounded overflow-hidden border border-gray-200/80 flex items-center justify-center relative">
                    <img
                      src={p.dataUrl}
                      alt={`Trang ${i + 1}`}
                      className="w-full h-full object-contain pointer-events-none"
                    />

                    {/* Indicators for fields on this page */}
                    <div className="absolute bottom-1 right-1 flex items-center gap-1">
                      {hasSignatureField && (
                        <span
                          className="px-1 py-0.5 bg-indigo-600/90 text-white rounded text-[8px] font-bold shadow-xs"
                          title="Trang có trường chữ ký"
                        >
                          Ký
                        </span>
                      )}
                      {hasTextField && (
                        <span
                          className="px-1 py-0.5 bg-blue-600/90 text-white rounded text-[8px] font-bold shadow-xs"
                          title="Trang có trường văn bản"
                        >
                          Chữ
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Page Label & Quick Actions */}
                  <div className="mt-1.5 flex items-center justify-between px-1">
                    <span
                      className={`text-xs font-semibold ${
                        isSelected
                          ? 'text-indigo-700 font-bold'
                          : isCurrentInView
                          ? 'text-blue-700'
                          : 'text-gray-600'
                      }`}
                    >
                      Trang {i + 1}
                    </span>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      {!isDigitallySigned && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePages([i]);
                          }}
                          className="p-0.5 text-gray-400 hover:text-red-600 rounded"
                          title="Xóa trang này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Drop Indicator (After) */}
                {isDragOverThis && dropPosition === 'after' && (
                  <div className="absolute -bottom-2 left-0 right-0 h-1 bg-indigo-600 rounded-full z-40 shadow-sm" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
