import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ 
  placeholder = "搜尋...", 
  className,
  value = '',
  onChange,
  ...props
}: SearchBarProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-card/80 border border-border/20 text-card-foreground rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:bg-card/100 transition-colors text-sm"
        value={value}
        onChange={handleChange}
        {...props}
      />
      <Search className="absolute right-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
