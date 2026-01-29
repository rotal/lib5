import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Color } from '../../types/data';

interface ColorPickerProps {
  value: Color;
  onChange: (color: Color) => void;
  onChangeEnd?: (color: Color) => void;
  showAlpha?: boolean;
  label?: string;
  className?: string;
}

function colorToHex(color: Color): string {
  const r = Math.round(color.r).toString(16).padStart(2, '0');
  const g = Math.round(color.g).toString(16).padStart(2, '0');
  const b = Math.round(color.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToColor(hex: string): Color | null {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
    a: 1,
  };
}

export function ColorPicker({
  value,
  onChange,
  onChangeEnd,
  showAlpha = true,
  label,
  className = '',
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(colorToHex(value));
  const containerRef = useRef<HTMLDivElement>(null);

  // Update hex input when value changes externally
  useEffect(() => {
    setHexInput(colorToHex(value));
  }, [value]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (onChangeEnd) onChangeEnd(value);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, value, onChangeEnd]);

  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setHexInput(hex);

    const color = hexToColor(hex);
    if (color) {
      onChange({ ...color, a: value.a });
    }
  }, [onChange, value.a]);

  const handleHexBlur = useCallback(() => {
    const color = hexToColor(hexInput);
    if (color) {
      onChange({ ...color, a: value.a });
      if (onChangeEnd) onChangeEnd({ ...color, a: value.a });
    } else {
      setHexInput(colorToHex(value));
    }
  }, [hexInput, onChange, onChangeEnd, value]);

  const handleRgbChange = useCallback((channel: 'r' | 'g' | 'b', val: number) => {
    onChange({ ...value, [channel]: val });
  }, [onChange, value]);

  const handleAlphaChange = useCallback((val: number) => {
    onChange({ ...value, a: val / 100 });
  }, [onChange, value]);

  const handleChangeEnd = useCallback(() => {
    if (onChangeEnd) onChangeEnd(value);
  }, [onChangeEnd, value]);

  const colorStyle = {
    backgroundColor: `rgba(${value.r}, ${value.g}, ${value.b}, ${value.a})`,
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs text-editor-text-dim mb-1">{label}</label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-2 py-1.5 bg-editor-surface-light border border-editor-border rounded-md hover:border-editor-accent transition-colors"
      >
        <div
          className="w-6 h-6 rounded border border-editor-border"
          style={colorStyle}
        />
        <span className="text-sm font-mono text-editor-text">
          {colorToHex(value).toUpperCase()}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 p-3 bg-editor-surface border border-editor-border rounded-lg shadow-lg z-50 min-w-[200px]">
          {/* Hex input */}
          <div className="mb-3">
            <label className="block text-xs text-editor-text-dim mb-1">Hex</label>
            <input
              type="text"
              value={hexInput}
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              className="w-full px-2 py-1 bg-editor-surface-light border border-editor-border rounded text-sm font-mono text-editor-text"
            />
          </div>

          {/* RGB sliders */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-4 text-xs text-red-400">R</span>
              <input
                type="range"
                min="0"
                max="255"
                value={value.r}
                onChange={(e) => handleRgbChange('r', parseInt(e.target.value))}
                onMouseUp={handleChangeEnd}
                className="flex-1 h-2 bg-gradient-to-r from-black to-red-500 rounded appearance-none"
              />
              <span className="w-8 text-xs text-editor-text-dim font-mono">
                {Math.round(value.r)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-4 text-xs text-green-400">G</span>
              <input
                type="range"
                min="0"
                max="255"
                value={value.g}
                onChange={(e) => handleRgbChange('g', parseInt(e.target.value))}
                onMouseUp={handleChangeEnd}
                className="flex-1 h-2 bg-gradient-to-r from-black to-green-500 rounded appearance-none"
              />
              <span className="w-8 text-xs text-editor-text-dim font-mono">
                {Math.round(value.g)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-4 text-xs text-blue-400">B</span>
              <input
                type="range"
                min="0"
                max="255"
                value={value.b}
                onChange={(e) => handleRgbChange('b', parseInt(e.target.value))}
                onMouseUp={handleChangeEnd}
                className="flex-1 h-2 bg-gradient-to-r from-black to-blue-500 rounded appearance-none"
              />
              <span className="w-8 text-xs text-editor-text-dim font-mono">
                {Math.round(value.b)}
              </span>
            </div>

            {showAlpha && (
              <div className="flex items-center gap-2">
                <span className="w-4 text-xs text-editor-text-dim">A</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={value.a * 100}
                  onChange={(e) => handleAlphaChange(parseInt(e.target.value))}
                  onMouseUp={handleChangeEnd}
                  className="flex-1 h-2 bg-gradient-to-r from-transparent to-white rounded appearance-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, transparent, rgba(${value.r}, ${value.g}, ${value.b}, 1))`,
                  }}
                />
                <span className="w-8 text-xs text-editor-text-dim font-mono">
                  {Math.round(value.a * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Color preview */}
          <div className="mt-3 flex gap-2">
            <div className="flex-1 h-8 rounded border border-editor-border" style={colorStyle} />
          </div>
        </div>
      )}
    </div>
  );
}
