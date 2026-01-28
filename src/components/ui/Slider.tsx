import React, { useCallback, useRef } from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  onChange,
  onChangeEnd,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = true,
  disabled = false,
  className = '',
}: SliderProps) {
  const isDragging = useRef(false);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
    isDragging.current = true;
  }, [onChange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current && onChangeEnd) {
      onChangeEnd(value);
      isDragging.current = false;
    }
  }, [value, onChangeEnd]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging.current && onChangeEnd) {
      onChangeEnd(value);
      isDragging.current = false;
    }
  }, [value, onChangeEnd]);

  // Calculate percentage for custom track fill
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-editor-text-dim">
          {label && <span>{label}</span>}
          {showValue && (
            <span className="font-mono">
              {step < 1 ? value.toFixed(2) : value}
            </span>
          )}
        </div>
      )}
      <div className="relative">
        <input
          type="range"
          value={value}
          onChange={handleChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full h-2 bg-editor-surface-light rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: disabled
              ? undefined
              : `linear-gradient(to right, rgb(99 102 241) 0%, rgb(99 102 241) ${percentage}%, rgb(45 45 74) ${percentage}%, rgb(45 45 74) 100%)`,
          }}
        />
      </div>
    </div>
  );
}
