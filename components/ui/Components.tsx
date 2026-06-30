import React from 'react';
import { Loader2 } from 'lucide-react';
import { DateInput } from './DateInput';

// Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'secondary';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}
export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', loading, className = '', ...props
}) => {
  const base = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:grayscale shadow-sm";

  const variants = {
    primary: "bg-accent text-white hover:shadow-lg transition-all",
    secondary: "bg-gray-900 text-white hover:bg-gray-800 hover:shadow-gray-200 hover:shadow-lg",
    outline: "border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 hover:text-gray-950 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700",
    ghost: "hover:bg-gray-100/80 dark:hover:bg-slate-800/80 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white shadow-none border-transparent",
    danger: "bg-red-500 text-white hover:bg-red-600 hover:shadow-red-200 hover:shadow-lg",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-emerald-200 hover:shadow-lg",
  };

  const sizes = {
    sm: "h-9 px-4 text-xs",
    md: "h-11 px-6 text-sm",
    lg: "h-12 px-8 text-base",
    icon: "h-10 w-10 p-0 rounded-full",
  };

  return (
    <button 
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} 
      disabled={loading || props.disabled} 
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
};

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Com type="date": usa só o calendário (sem digitar). */
  pickerOnly?: boolean;
}
export const Input: React.FC<InputProps> = ({ label, error, helperText, className = '', type, pickerOnly, ...props }) => {
  if (type === 'date') {
    return (
      <DateInput
        label={label}
        error={error}
        helperText={helperText}
        className={className}
        pickerOnly={pickerOnly}
        {...(props as any)}
      />
    );
  }
  return (
    <div className="w-full space-y-1.5">
      {label && <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">{label}</label>}
      <div className="relative group">
        <input
          type={type}
          className={`flex h-11 w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-2 text-sm text-gray-900 dark:text-white transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-white dark:focus:bg-slate-900 group-hover:border-gray-300 dark:group-hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="text-[11px] text-red-500 font-medium ml-1">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{helperText}</p>
      ) : null}
    </div>
  );
};

export { DateInput } from './DateInput';

// Select
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}
export const Select: React.FC<SelectProps> = ({ label, error, helperText, className = '', children, ...props }) => (
  <div className="w-full space-y-1.5">
    {label && <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">{label}</label>}
    <select
      className={`flex h-11 w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-2 text-sm text-gray-900 dark:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent focus:bg-white dark:focus:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[right_1rem_center] bg-no-repeat pr-10 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} ${className}`}
      {...props}
    >
      {children}
    </select>
    {error ? (
      <p className="text-[11px] text-red-500 font-medium ml-1">{error}</p>
    ) : helperText ? (
      <p className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{helperText}</p>
    ) : null}
  </div>
);

// Card
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shadow-gray-200/50 dark:shadow-none overflow-hidden ${className}`} {...props}>{children}</div>
);

// Badge
export const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger' | 'outline' | 'info' | 'secondary'; className?: string }> = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: "bg-blue-50 text-blue-700 border-blue-100",
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warning: "bg-amber-50 text-amber-700 border-amber-100",
    danger: "bg-rose-50 text-rose-700 border-rose-100",
    info: "bg-indigo-50 text-indigo-700 border-indigo-100",
    outline: "border border-gray-200 text-gray-600 bg-white",
    secondary: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// Textarea
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export const Textarea: React.FC<TextareaProps> = ({ label, error, className = '', ...props }) => (
  <div className="w-full space-y-1.5">
    {label && <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1">{label}</label>}
    <textarea
      className={`flex min-h-[100px] w-full rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 px-4 py-3 text-sm text-gray-900 dark:text-white transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} ${className}`}
      {...props}
    />
    {error && <p className="text-[11px] text-red-500 font-medium ml-1">{error}</p>}
  </div>
);

// Label
export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ children, className = '', ...props }) => (
  <label className={`block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider ml-1 mb-1.5 ${className}`} {...props}>
    {children}
  </label>
);
// Dropdown Menu
export const DropdownMenu = ({ children, className = "" }) => (
  <div className={`relative inline-block text-left ${className}`}>{children}</div>
);

export const DropdownMenuTrigger = ({ children, onClick = undefined, onContextMenu = undefined, className = "" }) => (
  <div 
    onClick={(e) => { 
      e.preventDefault();
      e.stopPropagation(); 
      onClick?.(e); 
    }} 
    onContextMenu={(e) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      if (onContextMenu) onContextMenu(e);
      else onClick?.(e); 
      return false; // Forçar bloqueio em navegadores antigos
    }}
    className={`cursor-pointer ${className}`}
  >
    {children}
  </div>
);

export const DropdownMenuContent = ({ isOpen, onClose, children, align = 'right', position = undefined }) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = React.useState(position);

  React.useLayoutEffect(() => {
    if (isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 10;
      
      if (position) {
        let x = position.x;
        let y = position.y;

        if (x + rect.width > window.innerWidth) {
          x = window.innerWidth - rect.width - padding;
        }
        if (y + rect.height > window.innerHeight) {
          y = window.innerHeight - rect.height - padding;
        }
        setAdjustedPos({ x, y });
      } else {
        // Handle regular dropdown alignment if it goes off screen
        if (rect.bottom > window.innerHeight) {
          menuRef.current.style.bottom = '100%';
          menuRef.current.style.top = 'auto';
          menuRef.current.style.marginBottom = '8px'; // Add some space above the trigger
        }
      }
    } else {
      setAdjustedPos(position);
    }
  }, [isOpen, position]);

  if (!isOpen) return null;
  
  const style = position && adjustedPos ? {
    position: 'fixed' as const,
    top: adjustedPos.y,
    left: adjustedPos.x,
    marginTop: 0
  } : {};

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div 
        ref={menuRef}
        style={style}
        className={`absolute z-50 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black ring-opacity-5 dark:ring-slate-800 focus:outline-none overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${!position && align === 'right' ? 'right-0' : 'left-0'}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="py-1 max-h-[60vh] overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({ 
  children, 
  onClick, 
  variant = 'default',
  disabled
}) => (
  <button
    disabled={disabled}
    onClick={(e) => {
      if (disabled) return;
      e.stopPropagation();
      onClick();
    }}
    className={`flex w-full items-center px-4 py-2 text-sm transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed text-gray-400' :
      variant === 'danger' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);
