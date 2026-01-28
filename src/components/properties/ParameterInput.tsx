import React, { useCallback, useRef } from 'react';
import { ParameterDefinition, SizeValue } from '../../types/node';
import { Color } from '../../types/data';
import { Slider, ColorPicker, Select, Toggle, NumberInput, Input, SizeInput } from '../ui';

interface ParameterInputProps {
  definition: ParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onChangeEnd: () => void;
}

export function ParameterInput({
  definition,
  value,
  onChange,
  onChangeEnd,
}: ParameterInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('ParameterInput - file selected:', file?.name, file?.type, file?.size);
    if (file) {
      // Read file as data URL to ensure it persists in state
      const reader = new FileReader();
      reader.onload = () => {
        console.log('ParameterInput - file read as data URL, length:', (reader.result as string)?.length);
        // Store both data URL and filename for persistence
        onChange({
          dataUrl: reader.result as string,
          filename: file.name,
        });
        onChangeEnd();
      };
      reader.readAsDataURL(file);
    }
  }, [onChange, onChangeEnd]);

  switch (definition.type) {
    case 'number': {
      const numValue = typeof value === 'number' ? value : definition.default as number;
      const { min, max, step } = definition.constraints || {};

      // Use slider if we have min/max bounds
      if (min !== undefined && max !== undefined) {
        return (
          <Slider
            label={definition.name}
            value={numValue}
            onChange={onChange as (v: number) => void}
            onChangeEnd={onChangeEnd}
            min={min}
            max={max}
            step={step || 1}
          />
        );
      }

      // Otherwise use number input
      return (
        <NumberInput
          label={definition.name}
          value={numValue}
          onChange={onChange as (v: number) => void}
          onChangeEnd={onChangeEnd}
          min={min}
          max={max}
          step={step}
        />
      );
    }

    case 'boolean': {
      const boolValue = typeof value === 'boolean' ? value : definition.default as boolean;
      return (
        <Toggle
          label={definition.name}
          value={boolValue}
          onChange={(v) => {
            onChange(v);
            onChangeEnd();
          }}
        />
      );
    }

    case 'string': {
      const strValue = typeof value === 'string' ? value : (definition.default as string) || '';
      return (
        <Input
          label={definition.name}
          value={strValue}
          onChange={onChange as (v: string) => void}
          onChangeEnd={onChangeEnd}
        />
      );
    }

    case 'select': {
      const options = definition.options || [];
      const selectValue = value ?? definition.default;
      return (
        <Select
          label={definition.name}
          value={selectValue as string | number}
          onChange={(v) => {
            onChange(v);
            onChangeEnd();
          }}
          options={options}
        />
      );
    }

    case 'color': {
      const colorValue: Color = (value as Color) || (definition.default as Color) || {
        r: 128,
        g: 128,
        b: 128,
        a: 1,
      };
      return (
        <ColorPicker
          label={definition.name}
          value={colorValue}
          onChange={onChange as (v: Color) => void}
          onChangeEnd={onChangeEnd as (v: Color) => void}
        />
      );
    }

    case 'size': {
      const sizeValue: SizeValue = (value as SizeValue) || (definition.default as SizeValue) || {
        width: 512,
        height: 512,
        locked: false,
      };
      return (
        <SizeInput
          label={definition.name}
          value={sizeValue}
          onChange={onChange as (v: SizeValue) => void}
          onChangeEnd={onChangeEnd as unknown as (v: SizeValue) => void}
          constraints={definition.sizeConstraints}
        />
      );
    }

    case 'file': {
      // Support both old format (string) and new format (object with dataUrl and filename)
      const fileValue = value as { dataUrl: string; filename: string } | string | null;
      const hasFile = fileValue !== null && (
        (typeof fileValue === 'string' && fileValue.startsWith('data:')) ||
        (typeof fileValue === 'object' && fileValue.dataUrl?.startsWith('data:'))
      );
      const filename = typeof fileValue === 'object' && fileValue?.filename
        ? fileValue.filename
        : null;
      const fileLabel = hasFile
        ? (filename || 'Image loaded')
        : 'Select file...';
      return (
        <div>
          <label className="block text-xs text-editor-text-dim mb-1">
            {definition.name}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 px-3 py-2 border rounded-md text-sm transition-colors text-left truncate ${
                hasFile
                  ? 'bg-green-900/30 border-green-600 text-green-400'
                  : 'bg-editor-surface-light border-editor-border text-editor-text hover:bg-editor-border'
              }`}
              title={filename || undefined}
            >
              {fileLabel}
            </button>
            {hasFile && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  onChangeEnd();
                }}
                className="px-2 py-2 bg-editor-surface-light border border-editor-border rounded-md text-editor-text-dim hover:text-editor-text transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={definition.accept}
            onChange={handleFileSelect}
            className="hidden"
          />
          {hasFile && (
            <p className="text-xs text-green-400 mt-1">
              {filename ? `Ready: ${filename}` : 'Image ready'}
            </p>
          )}
        </div>
      );
    }

    default:
      return (
        <div className="text-xs text-editor-text-dim">
          Unknown parameter type: {definition.type}
        </div>
      );
  }
}
