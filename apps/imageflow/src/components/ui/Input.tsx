import React from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  onChangeEnd?: (value: string) => void;
}

export function Input({
  label,
  value,
  onChange,
  onChangeEnd,
  type = 'text',
  className = '',
  ...props
}: InputProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-editor-text-dim mb-1">{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChangeEnd?.(e.target.value)}
        className="w-full px-2 py-1.5 bg-editor-surface-light border border-editor-border rounded-md text-sm text-editor-text focus:outline-none focus:border-editor-accent disabled:opacity-50 disabled:cursor-not-allowed"
        {...props}
      />
    </div>
  );
}

interface NumberInputProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function NumberInput({
  label,
  value,
  onChange,
  onChangeEnd,
  min,
  max,
  step = 1,
  disabled = false,
  className = '',
}: NumberInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, val));
      onChange(clamped);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && onChangeEnd) {
      onChangeEnd(val);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-editor-text-dim mb-1">{label}</label>
      )}
      <input
        type="number"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full px-2 py-1.5 bg-editor-surface-light border border-editor-border rounded-md text-sm text-editor-text font-mono focus:outline-none focus:border-editor-accent disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
