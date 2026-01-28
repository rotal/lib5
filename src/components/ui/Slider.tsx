import React, { useCallback, useRef, useState } from 'react';

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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

  // Handle clicking on the value to edit
  const handleValueClick = useCallback(() => {
    if (disabled) return;
    setEditValue(step < 1 ? value.toFixed(2) : String(value));
    setIsEditing(true);
  }, [value, step, disabled]);

  // Handle input change while editing
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  // Commit the edited value
  const commitEdit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      if (onChangeEnd) {
        onChangeEnd(clamped);
      }
    }
    setIsEditing(false);
  }, [editValue, min, max, onChange, onChangeEnd]);

  // Handle key press in input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [commitEdit]);

  // Calculate percentage for custom track fill
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-editor-text-dim">
          {label && <span>{label}</span>}
          {showValue && (
            isEditing ? (
              <input
                type="text"
                value={editValue}
                onChange={handleInputChange}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-16 px-1 py-0 text-right font-mono text-xs bg-editor-surface border border-editor-accent rounded outline-none text-editor-text"
              />
            ) : (
              <span
                className="font-mono cursor-text hover:text-editor-text px-1 rounded hover:bg-editor-surface-light"
                onClick={handleValueClick}
                title="Click to edit"
              >
                {step < 1 ? value.toFixed(2) : value}
              </span>
            )
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
