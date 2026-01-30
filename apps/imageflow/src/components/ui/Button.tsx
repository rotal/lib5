import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseClasses = `
    inline-flex items-center justify-center font-medium rounded-lg
    transition-all duration-150 ease-out
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-editor-bg
    disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.97]
  `.replace(/\s+/g, ' ').trim();

  const variantClasses = {
    primary: `
      bg-gradient-to-b from-editor-accent to-indigo-600
      text-white shadow-sm
      hover:from-editor-accent-light hover:to-editor-accent hover:shadow-md
      focus-visible:ring-editor-accent
    `,
    secondary: `
      bg-editor-surface-light/80 text-editor-text
      border border-editor-border
      hover:bg-editor-surface-hover hover:border-editor-border-light
      focus-visible:ring-editor-border
    `,
    ghost: `
      bg-transparent text-editor-text-secondary
      hover:bg-white/5 hover:text-editor-text
      focus-visible:ring-editor-border
    `,
    danger: `
      bg-gradient-to-b from-editor-error to-red-600
      text-white shadow-sm
      hover:from-red-500 hover:to-editor-error hover:shadow-md
      focus-visible:ring-editor-error
    `,
    success: `
      bg-gradient-to-b from-editor-success to-emerald-600
      text-white shadow-sm
      hover:from-emerald-500 hover:to-editor-success hover:shadow-md
      focus-visible:ring-editor-success
    `,
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  };

  const variantClass = variantClasses[variant].replace(/\s+/g, ' ').trim();

  return (
    <button
      className={`${baseClasses} ${variantClass} ${sizeClasses[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
