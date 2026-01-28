import { useCallback, useState, useEffect } from 'react';
import type { SizeValue, SizeConstraints } from '../../types/node';
import { Slider } from './Slider';

interface SizeInputProps {
  value: SizeValue;
  onChange: (value: SizeValue) => void;
  onChangeEnd?: (value: SizeValue) => void;
  constraints?: SizeConstraints;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SizeInput({
  value,
  onChange,
  onChangeEnd,
  constraints,
  label,
  disabled = false,
  className = '',
}: SizeInputProps) {
  const [aspectRatio, setAspectRatio] = useState(value.width / value.height);
  const locked = value.locked ?? false;

  // Update aspect ratio when value changes externally and not locked
  useEffect(() => {
    if (!locked && value.height > 0) {
      setAspectRatio(value.width / value.height);
    }
  }, [value.width, value.height, locked]);

  const clampWidth = useCallback((w: number) => {
    const min = constraints?.minWidth ?? 1;
    const max = constraints?.maxWidth ?? 8192;
    return Math.max(min, Math.min(max, Math.round(w)));
  }, [constraints]);

  const clampHeight = useCallback((h: number) => {
    const min = constraints?.minHeight ?? 1;
    const max = constraints?.maxHeight ?? 8192;
    return Math.max(min, Math.min(max, Math.round(h)));
  }, [constraints]);

  // During drag, only update the single value being dragged (no linked update)
  const handleWidthChange = useCallback((newWidth: number) => {
    const clampedWidth = clampWidth(newWidth);
    onChange({ width: clampedWidth, height: value.height, locked });
  }, [value.height, locked, onChange, clampWidth]);

  const handleHeightChange = useCallback((newHeight: number) => {
    const clampedHeight = clampHeight(newHeight);
    onChange({ width: value.width, height: clampedHeight, locked });
  }, [value.width, locked, onChange, clampHeight]);

  // On release, apply the linked dimension update if locked
  const handleWidthChangeEnd = useCallback((finalWidth: number) => {
    let newHeight = value.height;
    if (locked && aspectRatio > 0) {
      newHeight = clampHeight(Math.round(finalWidth / aspectRatio));
    }
    const newValue = { width: finalWidth, height: newHeight, locked };
    onChange(newValue);
    if (onChangeEnd) {
      onChangeEnd(newValue);
    }
  }, [value.height, locked, aspectRatio, onChange, onChangeEnd, clampHeight]);

  const handleHeightChangeEnd = useCallback((finalHeight: number) => {
    let newWidth = value.width;
    if (locked && aspectRatio > 0) {
      newWidth = clampWidth(Math.round(finalHeight * aspectRatio));
    }
    const newValue = { width: newWidth, height: finalHeight, locked };
    onChange(newValue);
    if (onChangeEnd) {
      onChangeEnd(newValue);
    }
  }, [value.width, locked, aspectRatio, onChange, onChangeEnd, clampWidth]);

  const handleLockToggle = useCallback(() => {
    const newLocked = !locked;
    if (newLocked && value.height > 0) {
      // Store current aspect ratio when locking
      setAspectRatio(value.width / value.height);
    }
    const newValue = { ...value, locked: newLocked };
    onChange(newValue);
    if (onChangeEnd) {
      onChangeEnd(newValue);
    }
  }, [locked, value, onChange, onChangeEnd]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-xs text-editor-text-dim">{label}</span>
      )}

      <div className="flex gap-2">
        {/* Width and Height sliders */}
        <div className="flex-1 flex flex-col gap-1">
          <Slider
            label="Width"
            value={value.width}
            onChange={handleWidthChange}
            onChangeEnd={handleWidthChangeEnd}
            min={constraints?.minWidth ?? 1}
            max={constraints?.maxWidth ?? 4096}
            step={constraints?.step ?? 1}
            disabled={disabled}
          />
          <Slider
            label="Height"
            value={value.height}
            onChange={handleHeightChange}
            onChangeEnd={handleHeightChangeEnd}
            min={constraints?.minHeight ?? 1}
            max={constraints?.maxHeight ?? 4096}
            step={constraints?.step ?? 1}
            disabled={disabled}
          />
        </div>

        {/* Chain link button */}
        <div className="flex items-center">
          <button
            onClick={handleLockToggle}
            disabled={disabled}
            className={`p-1 rounded transition-colors ${
              locked
                ? 'text-editor-accent'
                : 'text-editor-text-dim hover:text-editor-text'
            } disabled:opacity-50`}
            title={locked ? 'Unlink dimensions' : 'Link dimensions'}
          >
            {locked ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 15l3-3m2-2l3-3" />
                <path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13" />
                <path d="M13 18l-.397.534a5 5 0 0 1-7.071-7.072L6 11" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
