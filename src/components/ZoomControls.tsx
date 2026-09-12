import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, ChevronDown, Check } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onResetZoom: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const ZOOM_PRESETS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2.0 },
  { label: '300%', value: 3.0 },
];

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomChange,
  onFitWidth,
  onFitPage,
  onResetZoom,
  className = '',
  style,
}) => {
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const zoomPercent = Math.round(zoom * 100);

  const handleZoomIn = () => {
    const next = Math.min(3.0, Math.round((zoom + 0.15) * 100) / 100);
    onZoomChange(next);
  };

  const handleZoomOut = () => {
    const next = Math.max(0.25, Math.round((zoom - 0.15) * 100) / 100);
    onZoomChange(next);
  };

  // Close popup menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpenMenu(false);
      }
    };
    if (isOpenMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpenMenu]);

  return (
    <div
      style={style}
      className={`bg-white/95 backdrop-blur-md border border-gray-300/80 rounded-xl shadow-xl px-2 py-1 flex items-center gap-1 text-gray-700 select-none z-40 transition-all ${className}`}
    >
      {/* 1:1 Reset Zoom */}
      <button
        type="button"
        onClick={onResetZoom}
        title="Kích thước gốc (100%)"
        className={`px-2 py-1 text-xs font-bold rounded-md hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${
          zoomPercent === 100 ? 'bg-indigo-100 text-indigo-700 font-extrabold' : 'text-gray-600'
        }`}
      >
        1:1
      </button>

      {/* Fit Width */}
      <button
        type="button"
        onClick={onFitWidth}
        title="Vừa chiều rộng màn hình (Fit Width)"
        className="p-1.5 text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {/* Fit Page */}
      <button
        type="button"
        onClick={onFitPage}
        title="Vừa toàn bộ trang (Fit Page)"
        className="p-1.5 text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
      >
        <Minimize2 className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-gray-300 mx-0.5" />

      {/* Zoom % Selector Dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsOpenMenu(!isOpenMenu)}
          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer min-w-[58px] justify-between"
          title="Chọn tỉ lệ thu phóng"
        >
          <span>{zoomPercent}%</span>
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </button>

        {isOpenMenu && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-28 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 text-xs font-medium">
            <div className="px-2.5 py-1 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Thu phóng
            </div>
            {ZOOM_PRESETS.map((preset) => {
              const isSelected = Math.abs(zoom - preset.value) < 0.03;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    onZoomChange(preset.value);
                    setIsOpenMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${
                    isSelected ? 'font-bold text-indigo-700 bg-indigo-50/50' : 'text-gray-700'
                  }`}
                >
                  <span>{preset.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-gray-300 mx-0.5" />

      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={zoom <= 0.25}
        title="Thu nhỏ nội dung (Ctrl + Lăn chuột xuống)"
        className="p-1.5 text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Zoom In Button */}
      <button
        type="button"
        onClick={handleZoomIn}
        disabled={zoom >= 3.0}
        title="Phóng to nội dung (Ctrl + Lăn chuột lên)"
        className="p-1.5 text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-30 disabled:pointer-events-none"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
    </div>
  );
};
