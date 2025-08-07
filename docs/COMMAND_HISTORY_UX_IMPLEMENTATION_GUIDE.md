# CommandHistory UX Implementation Guide

This guide provides detailed technical implementation patterns for migrating the CommandHistory component to improved UX standards. It complements the UX Migration Plan with specific code examples and implementation strategies.

## 1. UX Pattern Implementation

### 1.1 Debounced Search Implementation

```typescript
// hooks/useDebounceSearch.ts
import { useState, useEffect, useCallback } from 'react';

interface UseDebounceSearchProps {
  initialValue: string;
  delay: number;
  onSearch: (value: string) => void;
}

export const useDebounceSearch = ({ 
  initialValue, 
  delay, 
  onSearch 
}: UseDebounceSearchProps) => {
  const [searchValue, setSearchValue] = useState(initialValue);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setIsSearching(true);
      onSearch(value);
      setIsSearching(false);
    }, delay),
    [onSearch, delay]
  );

  useEffect(() => {
    debouncedSearch(searchValue);
    return () => debouncedSearch.cancel();
  }, [searchValue, debouncedSearch]);

  return {
    searchValue,
    setSearchValue,
    isSearching
  };
};

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): T & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout;
  
  const debounced = ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => clearTimeout(timeoutId);
  
  return debounced;
}
```

### 1.2 Toast Notification System

```typescript
// contexts/ToastContext.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toastData: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = {
      ...toastData,
      id,
      duration: toastData.duration ?? 5000
    };

    setToasts(prev => [...prev, toast]);

    // Auto remove after duration
    if (toast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAllToasts }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
```

### 1.3 Skeleton Loading Component

```typescript
// components/ui/Skeleton.tsx
import React from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className,
  ...props
}) => {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700';
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-wave',
    none: ''
  };
  
  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded-md',
    circular: 'rounded-full'
  };

  const style = {
    width: width || (variant === 'text' ? '100%' : undefined),
    height: height || (variant === 'text' ? '1em' : undefined),
    ...props.style
  };

  return (
    <div
      className={cn(
        baseClasses,
        animationClasses[animation],
        variantClasses[variant],
        className
      )}
      style={style}
      role="status"
      aria-label="Loading content"
      {...props}
    />
  );
};

// Command History Skeleton
export const CommandHistorySkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <Skeleton width="200px" height="32px" />
      <Skeleton width="120px" height="32px" />
    </div>
    <Skeleton width="100%" height="40px" />
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="border rounded-lg p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton width="150px" height="20px" />
          <Skeleton width="80px" height="16px" />
        </div>
        <Skeleton width="100%" height="16px" />
        <Skeleton width="70%" height="16px" />
      </div>
    ))}
  </div>
);
```

## 2. Accessibility Implementation

### 2.1 WCAG 2.1 AA Compliance Patterns

```typescript
// hooks/useAccessibility.ts
import { useCallback, useRef, useEffect } from 'react';

export const useAccessibility = () => {
  const announceRef = useRef<HTMLDivElement>(null);

  const announceToScreenReader = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announceRef.current) {
      announceRef.current.setAttribute('aria-live', priority);
      announceRef.current.textContent = message;
      
      // Clear after announcement
      setTimeout(() => {
        if (announceRef.current) {
          announceRef.current.textContent = '';
        }
      }, 1000);
    }
  }, []);

  const ScreenReaderAnnouncer = useCallback(() => (
    <div
      ref={announceRef}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      role="status"
    />
  ), []);

  return {
    announceToScreenReader,
    ScreenReaderAnnouncer
  };
};

// Accessible Search Component
interface AccessibleSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultsCount?: number;
  isSearching?: boolean;
}

export const AccessibleSearch: React.FC<AccessibleSearchProps> = ({
  value,
  onChange,
  placeholder = "Search commands...",
  resultsCount,
  isSearching
}) => {
  const searchId = useId();
  const resultsId = useId();
  const { announceToScreenReader } = useAccessibility();

  useEffect(() => {
    if (resultsCount !== undefined && !isSearching) {
      const message = resultsCount === 0 
        ? "No results found"
        : `${resultsCount} result${resultsCount === 1 ? '' : 's'} found`;
      announceToScreenReader(message);
    }
  }, [resultsCount, isSearching, announceToScreenReader]);

  return (
    <div className="relative">
      <label htmlFor={searchId} className="sr-only">
        Search command history
      </label>
      <input
        id={searchId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        aria-describedby={resultsCount !== undefined ? resultsId : undefined}
        aria-busy={isSearching}
      />
      {isSearching && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <Spinner size="sm" />
        </div>
      )}
      {resultsCount !== undefined && (
        <div id={resultsId} className="sr-only">
          {resultsCount} result{resultsCount === 1 ? '' : 's'} found
        </div>
      )}
    </div>
  );
};
```

### 2.2 Keyboard Navigation Implementation

```typescript
// hooks/useKeyboardNavigation.ts
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseKeyboardNavigationProps {
  items: any[];
  onSelect?: (index: number, item: any) => void;
  onEscape?: () => void;
  isEnabled?: boolean;
}

export const useKeyboardNavigation = ({
  items,
  onSelect,
  onEscape,
  isEnabled = true
}: UseKeyboardNavigationProps) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isEnabled || items.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => 
          prev < items.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : items.length - 1
        );
        break;
      
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0 && onSelect) {
          onSelect(focusedIndex, items[focusedIndex]);
        }
        break;
      
      case 'Escape':
        event.preventDefault();
        setFocusedIndex(-1);
        onEscape?.();
        break;
      
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      
      case 'End':
        event.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
    }
  }, [items, focusedIndex, onSelect, onEscape, isEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (container && isEnabled) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, isEnabled]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const focusedElement = containerRef.current?.children[focusedIndex] as HTMLElement;
      focusedElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [focusedIndex]);

  return {
    focusedIndex,
    setFocusedIndex,
    containerRef,
    handleKeyDown
  };
};
```

## 3. Feature Flag Integration

### 3.1 Feature Flag Hook Implementation

```typescript
// hooks/useFeatureFlags.ts
import { useState, useEffect, useCallback } from 'react';

interface FeatureFlags {
  improvedCommandHistory: boolean;
  enhancedFiltering: boolean;
  batchOperations: boolean;
  advancedSearch: boolean;
  exportFeatures: boolean;
}

interface FeatureFlagConfig {
  rolloutPercentage?: number;
  userSegments?: string[];
  startDate?: Date;
  endDate?: Date;
}

class FeatureFlagManager {
  private flags: Map<keyof FeatureFlags, FeatureFlagConfig> = new Map();
  private userSegment: string;

  constructor() {
    this.userSegment = this.determineUserSegment();
    this.initializeFlags();
  }

  private determineUserSegment(): string {
    // Implement user segmentation logic
    const userId = localStorage.getItem('userId') || 'anonymous';
    const hash = this.simpleHash(userId);
    return hash % 10 < 3 ? 'early-adopter' : 'stable';
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private initializeFlags() {
    this.flags.set('improvedCommandHistory', {
      rolloutPercentage: 25,
      userSegments: ['early-adopter'],
      startDate: new Date('2024-01-15')
    });
    
    this.flags.set('enhancedFiltering', {
      rolloutPercentage: 50,
      userSegments: ['early-adopter', 'stable']
    });
  }

  isEnabled(flag: keyof FeatureFlags): boolean {
    const config = this.flags.get(flag);
    if (!config) return false;

    // Check date constraints
    const now = new Date();
    if (config.startDate && now < config.startDate) return false;
    if (config.endDate && now > config.endDate) return false;

    // Check user segment
    if (config.userSegments && !config.userSegments.includes(this.userSegment)) {
      return false;
    }

    // Check rollout percentage
    if (config.rolloutPercentage !== undefined) {
      const userId = localStorage.getItem('userId') || 'anonymous';
      const hash = this.simpleHash(userId + flag);
      return (hash % 100) < config.rolloutPercentage;
    }

    return true;
  }

  getAllFlags(): FeatureFlags {
    return {
      improvedCommandHistory: this.isEnabled('improvedCommandHistory'),
      enhancedFiltering: this.isEnabled('enhancedFiltering'),
      batchOperations: this.isEnabled('batchOperations'),
      advancedSearch: this.isEnabled('advancedSearch'),
      exportFeatures: this.isEnabled('exportFeatures')
    };
  }
}

const featureFlagManager = new FeatureFlagManager();

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlagManager.getAllFlags());

  const refreshFlags = useCallback(() => {
    setFlags(featureFlagManager.getAllFlags());
  }, []);

  useEffect(() => {
    // Refresh flags periodically
    const interval = setInterval(refreshFlags, 60000); // Every minute
    return () => clearInterval(interval);
  }, [refreshFlags]);

  return {
    flags,
    refreshFlags,
    isEnabled: (flag: keyof FeatureFlags) => flags[flag]
  };
};
```

### 3.2 Progressive Component Migration

```typescript
// components/CommandHistory/CommandHistoryContainer.tsx
import React, { Suspense } from 'react';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { CommandHistorySkeleton } from '../ui/Skeleton';
import { ErrorBoundary } from '../ErrorBoundary';

// Lazy load improved component
const ImprovedCommandHistory = React.lazy(() => 
  import('./ImprovedCommandHistory').then(module => ({
    default: module.ImprovedCommandHistory
  }))
);

// Fallback to legacy component
const LegacyCommandHistory = React.lazy(() =>
  import('./LegacyCommandHistory').then(module => ({
    default: module.LegacyCommandHistory
  }))
);

export const CommandHistoryContainer: React.FC = () => {
  const { isEnabled } = useFeatureFlags();
  const useImprovedVersion = isEnabled('improvedCommandHistory');

  return (
    <ErrorBoundary
      fallback={<CommandHistoryFallback />}
      onError={(error) => {
        console.error('CommandHistory component error:', error);
        // Log to analytics/monitoring service
      }}
    >
      <Suspense fallback={<CommandHistorySkeleton />}>
        {useImprovedVersion ? (
          <ImprovedCommandHistory />
        ) : (
          <LegacyCommandHistory />
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

const CommandHistoryFallback: React.FC = () => (
  <div className="p-6 text-center">
    <h3 className="text-lg font-medium text-gray-900 mb-2">
      Unable to load command history
    </h3>
    <p className="text-gray-600 mb-4">
      There was an error loading the command history component.
    </p>
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      Refresh Page
    </button>
  </div>
);
```

## 4. Performance Optimization

### 4.1 React.memo and useCallback Patterns

```typescript
// components/CommandHistory/CommandItem.tsx
import React, { memo, useCallback } from 'react';
import { Command } from '../../types';

interface CommandItemProps {
  command: Command;
  isSelected?: boolean;
  onSelect?: (command: Command) => void;
  onCopy?: (command: Command) => void;
  onDelete?: (command: Command) => void;
}

export const CommandItem = memo<CommandItemProps>(({
  command,
  isSelected = false,
  onSelect,
  onCopy,
  onDelete
}) => {
  const handleSelect = useCallback(() => {
    onSelect?.(command);
  }, [command, onSelect]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy?.(command);
  }, [command, onCopy]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(command);
  }, [command, onDelete]);

  return (
    <div
      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
      }`}
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-selected={isSelected}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {command.command}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(command.timestamp).toLocaleString()}
          </p>
        </div>
        <div className="flex space-x-2 ml-4">
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Copy command"
          >
            <CopyIcon size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-gray-400 hover:text-red-600"
            aria-label="Delete command"
          >
            <DeleteIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimization
  return (
    prevProps.command.id === nextProps.command.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.onCopy === nextProps.onCopy &&
    prevProps.onDelete === nextProps.onDelete
  );
});
```

### 4.2 Virtual Scrolling Implementation

```typescript
// hooks/useVirtualScrolling.ts
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVirtualScrollingProps {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export const useVirtualScrolling = ({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 5
}: UseVirtualScrollingProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight),
    itemCount - 1
  );

  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(itemCount - 1, visibleEnd + overscan);

  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    visibleItems.push({
      index: i,
      offsetY: i * itemHeight
    });
  }

  const totalHeight = itemCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (scrollElementRef.current) {
      scrollElementRef.current.scrollTo({
        top: Math.max(0, index * itemHeight - containerHeight / 2),
        behavior
      });
    }
  }, [itemHeight, containerHeight]);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    scrollElementRef,
    handleScroll,
    scrollToIndex
  };
};

// Virtual Command List Component
interface VirtualCommandListProps {
  commands: Command[];
  onCommandSelect: (command: Command) => void;
  selectedCommandId?: string;
}

export const VirtualCommandList: React.FC<VirtualCommandListProps> = ({
  commands,
  onCommandSelect,
  selectedCommandId
}) => {
  const containerHeight = 600; // Fixed height
  const itemHeight = 80; // Fixed item height

  const { visibleItems, totalHeight, offsetY, scrollElementRef, handleScroll } = 
    useVirtualScrolling({
      itemCount: commands.length,
      itemHeight,
      containerHeight
    });

  return (
    <div 
      ref={scrollElementRef}
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map(({ index }) => {
            const command = commands[index];
            return (
              <div
                key={command.id}
                style={{ height: itemHeight }}
              >
                <CommandItem
                  command={command}
                  onSelect={onCommandSelect}
                  isSelected={command.id === selectedCommandId}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
```

## 5. Mobile UX Implementation

### 5.1 Responsive Design Patterns

```typescript
// hooks/useResponsive.ts
import { useState, useEffect } from 'react';

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
};

export const useResponsive = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowSize.width < breakpoints.md;
  const isTablet = windowSize.width >= breakpoints.md && windowSize.width < breakpoints.lg;
  const isDesktop = windowSize.width >= breakpoints.lg;

  return {
    windowSize,
    isMobile,
    isTablet,
    isDesktop,
    breakpoints
  };
};
```

### 5.2 Touch-Friendly Components

```typescript
// components/ui/TouchFriendlyButton.tsx
import React, { useState, useCallback } from 'react';
import { cn } from '../../utils/cn';

interface TouchFriendlyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  touchFeedback?: boolean;
}

export const TouchFriendlyButton: React.FC<TouchFriendlyButtonProps> = ({
  variant = 'primary',
  size = 'md',
  touchFeedback = true,
  className,
  children,
  onTouchStart,
  onTouchEnd,
  ...props
}) => {
  const [isTouched, setIsTouched] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (touchFeedback) {
      setIsTouched(true);
    }
    onTouchStart?.(e);
  }, [touchFeedback, onTouchStart]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (touchFeedback) {
      setTimeout(() => setIsTouched(false), 150);
    }
    onTouchEnd?.(e);
  }, [touchFeedback, onTouchEnd]);

  const baseClasses = 'relative inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white focus:ring-red-500'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[36px]', // Minimum 36px for touch
    md: 'px-4 py-2 text-base min-h-[44px]', // Minimum 44px for touch
    lg: 'px-6 py-3 text-lg min-h-[48px]' // Minimum 48px for touch
  };

  const touchClasses = isTouched ? 'scale-95 bg-opacity-80' : '';

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        touchClasses,
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      {children}
    </button>
  );
};
```

### 5.3 Mobile Command History Layout

```typescript
// components/CommandHistory/MobileCommandHistory.tsx
import React, { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Command } from '../../types';

interface MobileCommandHistoryProps {
  commands: Command[];
  onCommandSelect: (command: Command) => void;
}

export const MobileCommandHistory: React.FC<MobileCommandHistoryProps> = ({
  commands,
  onCommandSelect
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);

  const handleSwipe = useSwipeable({
    onSwipedLeft: (eventData) => {
      const commandId = eventData.event.currentTarget.getAttribute('data-command-id');
      if (commandId) {
        setSwipedId(commandId);
      }
    },
    onSwipedRight: (eventData) => {
      const commandId = eventData.event.currentTarget.getAttribute('data-command-id');
      if (commandId && swipedId === commandId) {
        setSwipedId(null);
      }
    },
    trackMouse: false,
    trackTouch: true
  });

  return (
    <div className="space-y-2">
      {commands.map(command => (
        <div
          key={command.id}
          className="relative overflow-hidden bg-white rounded-lg shadow-sm border"
        >
          {/* Swipe actions background */}
          <div className="absolute inset-y-0 right-0 flex items-center justify-end bg-red-500 text-white px-4">
            <span className="text-sm font-medium">Delete</span>
          </div>
          
          {/* Main content */}
          <div
            {...handleSwipe}
            data-command-id={command.id}
            className={`relative bg-white transition-transform duration-200 ${
              swipedId === command.id ? '-translate-x-20' : 'translate-x-0'
            }`}
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => {
                if (expandedId === command.id) {
                  setExpandedId(null);
                } else {
                  setExpandedId(command.id);
                }
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {command.command}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(command.timestamp).toLocaleString()}
                  </p>
                </div>
                <button className="ml-4 p-2 text-gray-400">
                  <ChevronDownIcon 
                    className={`w-4 h-4 transition-transform ${
                      expandedId === command.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
              
              {/* Expanded content */}
              {expandedId === command.id && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="text-sm text-gray-700">
                    <strong>Full command:</strong>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                      {command.command}
                    </pre>
                  </div>
                  <div className="flex space-x-2">
                    <TouchFriendlyButton
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(command.command);
                      }}
                    >
                      Copy
                    </TouchFriendlyButton>
                    <TouchFriendlyButton
                      size="sm"
                      variant="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCommandSelect(command);
                      }}
                    >
                      Execute
                    </TouchFriendlyButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
```

## 6. Error State UX Implementation

### 6.1 Comprehensive Error Handling

```typescript
// hooks/useErrorHandling.ts
import { useState, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';

interface ErrorState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
}

interface UseErrorHandlingOptions {
  maxRetries?: number;
  onError?: (error: Error, errorInfo: any) => void;
  fallbackComponent?: React.ComponentType<any>;
}

export const useErrorHandling = (options: UseErrorHandlingOptions = {}) => {
  const { maxRetries = 3, onError } = options;
  const { addToast } = useToast();
  const [errorState, setErrorState] = useState<ErrorState>({
    hasError: false,
    error: null,
    errorId: null,
    retryCount: 0
  });

  const handleError = useCallback((error: Error, errorInfo?: any) => {
    const errorId = `error-${Date.now()}-${Math.random()}`;
    
    setErrorState(prev => ({
      hasError: true,
      error,
      errorId,
      retryCount: prev.retryCount + 1
    }));

    // Log error
    console.error('Error caught by error handler:', error, errorInfo);
    
    // Call custom error handler
    onError?.(error, errorInfo);

    // Show toast notification
    addToast({
      type: 'error',
      title: 'Something went wrong',
      message: error.message,
      duration: 8000,
      action: {
        label: 'Retry',
        onClick: () => retry()
      }
    });
  }, [addToast, onError]);

  const retry = useCallback(() => {
    if (errorState.retryCount < maxRetries) {
      setErrorState(prev => ({
        hasError: false,
        error: null,
        errorId: null,
        retryCount: prev.retryCount
      }));
    } else {
      addToast({
        type: 'error',
        title: 'Maximum retries exceeded',
        message: 'Please refresh the page or contact support if the problem persists.',
        duration: 0 // Don't auto-dismiss
      });
    }
  }, [errorState.retryCount, maxRetries, addToast]);

  const clearError = useCallback(() => {
    setErrorState({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0
    });
  }, []);

  return {
    errorState,
    handleError,
    retry,
    clearError,
    canRetry: errorState.retryCount < maxRetries
  };
};
```

### 6.2 Error Boundary with Recovery

```typescript
// components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorBoundaryFallbackProps>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryFallbackProps {
  error: Error;
  resetError: () => void;
  canRetry: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      retryCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Log to error reporting service
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        retryCount: prevState.retryCount + 1
      }));
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.resetError}
          canRetry={this.state.retryCount < this.maxRetries}
        />
      );
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.FC<ErrorBoundaryFallbackProps> = ({
  error,
  resetError,
  canRetry
}) => {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mb-4">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Something went wrong
        </h3>
        <p className="text-gray-600 mb-6">
          {error.message || 'An unexpected error occurred while loading this component.'}
        </p>
        <div className="space-y-3">
          {canRetry && (
            <button
              onClick={resetError}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Refresh Page
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Error Details (Development)
            </summary>
            <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};
```

## 7. Testing Strategy

### 7.1 UX-Focused Testing Utilities

```typescript
// tests/utils/ux-testing.ts
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// Custom render with providers
export const renderWithProviders = (
  ui: React.ReactElement,
  options: {
    featureFlags?: Partial<FeatureFlags>;
    initialToasts?: Toast[];
  } = {}
) => {
  const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <FeatureFlagProvider flags={options.featureFlags}>
      <ToastProvider initialToasts={options.initialToasts}>
        {children}
      </ToastProvider>
    </FeatureFlagProvider>
  );

  return render(ui, { wrapper: Providers });
};

// UX Testing utilities
export const uxTestUtils = {
  // Test loading states
  async expectLoadingState(elementMatcher: () => HTMLElement | null) {
    await waitFor(() => {
      const element = elementMatcher();
      expect(element).toBeInTheDocument();
      expect(element).toHaveAttribute('aria-busy', 'true');
    });
  },

  // Test error states
  async expectErrorState(errorMessage: string) {
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  },

  // Test accessibility
  async expectAccessible(container: HTMLElement) {
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  },

  // Test keyboard navigation
  async testKeyboardNavigation(items: HTMLElement[], expectedFocusOrder: number[]) {
    const user = userEvent.setup();
    
    // Focus first item
    items[0].focus();
    
    for (const expectedIndex of expectedFocusOrder) {
      await user.keyboard('{ArrowDown}');
      expect(items[expectedIndex]).toHaveFocus();
    }
  },

  // Test responsive behavior
  expectResponsiveClass(element: HTMLElement, breakpoint: 'mobile' | 'tablet' | 'desktop') {
    const classes = {
      mobile: 'sm:hidden',
      tablet: 'md:block lg:hidden',
      desktop: 'lg:block'
    };
    
    expect(element).toHaveClass(classes[breakpoint]);
  },

  // Test touch interactions
  async testTouchInteraction(element: HTMLElement) {
    const user = userEvent.setup();
    
    // Simulate touch
    await user.pointer([
      { keys: '[TouchA>]', target: element },
      { keys: '[/TouchA]' }
    ]);
    
    // Verify touch feedback
    expect(element).toHaveClass('scale-95');
  }
};
```

### 7.2 Component Integration Tests

```typescript
// tests/components/CommandHistory.test.tsx
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, uxTestUtils } from '../utils/ux-testing';
import { CommandHistoryContainer } from '../../src/components/CommandHistory/CommandHistoryContainer';
import { mockCommands } from '../fixtures/commands';

describe('CommandHistory UX Integration', () => {
  it('should provide loading state with skeleton', async () => {
    renderWithProviders(<CommandHistoryContainer />);
    
    // Should show skeleton loader
    expect(screen.getByRole('status', { name: /loading content/i })).toBeInTheDocument();
    
    // Wait for actual content
    await waitFor(() => {
      expect(screen.getByText(/command history/i)).toBeInTheDocument();
    });
  });

  it('should handle search with debouncing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandHistoryContainer />);

    const searchInput = await screen.findByLabelText(/search command history/i);
    
    // Type search query
    await user.type(searchInput, 'git commit');
    
    // Should show searching state
    expect(screen.getByLabelText(/searching/i)).toBeInTheDocument();
    
    // Wait for debounced search
    await waitFor(() => {
      expect(screen.getByText(/results found/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should be accessible', async () => {
    const { container } = renderWithProviders(<CommandHistoryContainer />);
    
    await waitFor(() => {
      expect(screen.getByText(/command history/i)).toBeInTheDocument();
    });
    
    await uxTestUtils.expectAccessible(container);
  });

  it('should support keyboard navigation', async () => {
    renderWithProviders(<CommandHistoryContainer />);
    
    await waitFor(() => {
      expect(screen.getByText(/command history/i)).toBeInTheDocument();
    });

    const commandItems = screen.getAllByRole('button', { name: /command/i });
    
    await uxTestUtils.testKeyboardNavigation(commandItems, [0, 1, 2, 0]); // Circular navigation
  });

  it('should handle errors gracefully', async () => {
    // Mock API error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    renderWithProviders(<CommandHistoryContainer />);
    
    await uxTestUtils.expectErrorState('Unable to load command history');
    
    // Should provide retry option
    expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
  });

  it('should show toast notifications for user actions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandHistoryContainer />);

    await waitFor(() => {
      expect(screen.getByText(/command history/i)).toBeInTheDocument();
    });

    const copyButton = screen.getAllByLabelText(/copy command/i)[0];
    await user.click(copyButton);

    // Should show success toast
    await waitFor(() => {
      expect(screen.getByText(/command copied/i)).toBeInTheDocument();
    });
  });

  it('should adapt to mobile viewport', async () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    renderWithProviders(<CommandHistoryContainer />);

    await waitFor(() => {
      const container = screen.getByTestId('command-history-container');
      uxTestUtils.expectResponsiveClass(container, 'mobile');
    });
  });

  it('should support feature flag toggling', async () => {
    // Test legacy version
    const { rerender } = renderWithProviders(<CommandHistoryContainer />, {
      featureFlags: { improvedCommandHistory: false }
    });

    await waitFor(() => {
      expect(screen.getByTestId('legacy-command-history')).toBeInTheDocument();
    });

    // Test improved version
    rerender(
      <CommandHistoryContainer />,
      { featureFlags: { improvedCommandHistory: true } }
    );

    await waitFor(() => {
      expect(screen.getByTestId('improved-command-history')).toBeInTheDocument();
    });
  });

  it('should handle batch operations', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandHistoryContainer />, {
      featureFlags: { batchOperations: true }
    });

    await waitFor(() => {
      expect(screen.getByText(/command history/i)).toBeInTheDocument();
    });

    // Select multiple commands
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    // Should show batch actions
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument();
  });
});
```

### 7.3 Performance Testing

```typescript
// tests/performance/CommandHistory.perf.test.tsx
import React from 'react';
import { render } from '@testing-library/react';
import { performance } from 'perf_hooks';
import { CommandHistoryContainer } from '../../src/components/CommandHistory/CommandHistoryContainer';
import { generateMockCommands } from '../fixtures/commands';

describe('CommandHistory Performance', () => {
  it('should render large datasets efficiently', async () => {
    const largeDataset = generateMockCommands(10000);
    
    const startTime = performance.now();
    
    render(<CommandHistoryContainer commands={largeDataset} />);
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Should render within reasonable time (< 500ms)
    expect(renderTime).toBeLessThan(500);
  });

  it('should not cause memory leaks', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Render and unmount multiple times
    for (let i = 0; i < 100; i++) {
      const { unmount } = render(<CommandHistoryContainer />);
      unmount();
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be minimal (< 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });

  it('should maintain 60fps during scrolling', async () => {
    const commands = generateMockCommands(1000);
    const { container } = render(<CommandHistoryContainer commands={commands} />);
    
    const scrollContainer = container.querySelector('[data-testid="scroll-container"]');
    
    let frameCount = 0;
    const startTime = performance.now();
    
    // Simulate scrolling
    const scrollInterval = setInterval(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop += 10;
        frameCount++;
      }
    }, 16); // ~60fps
    
    // Run for 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    clearInterval(scrollInterval);
    
    const endTime = performance.now();
    const actualFPS = frameCount / ((endTime - startTime) / 1000);
    
    // Should maintain close to 60fps
    expect(actualFPS).toBeGreaterThan(55);
  });
});
```

## Implementation Checklist

### Phase 1: Foundation (Week 1-2)
- [ ] Set up feature flag system
- [ ] Implement error boundary and error handling
- [ ] Create accessibility hooks and utilities
- [ ] Set up toast notification system
- [ ] Implement responsive design utilities

### Phase 2: Core UX Patterns (Week 3-4)
- [ ] Implement debounced search
- [ ] Create skeleton loading components
- [ ] Build keyboard navigation system
- [ ] Implement virtual scrolling for performance
- [ ] Create touch-friendly mobile components

### Phase 3: Integration (Week 5-6)
- [ ] Integrate improved components with feature flags
- [ ] Implement progressive rollout system
- [ ] Add comprehensive error states
- [ ] Create mobile-optimized layouts
- [ ] Implement batch operations

### Phase 4: Testing & Optimization (Week 7-8)
- [ ] Write UX-focused integration tests
- [ ] Perform accessibility auditing
- [ ] Conduct performance testing
- [ ] Test mobile interactions
- [ ] Validate feature flag behavior

### Phase 5: Deployment & Monitoring (Week 9-10)
- [ ] Deploy with feature flags disabled
- [ ] Gradually enable for user segments
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Full rollout based on metrics

## Conclusion

This implementation guide provides the technical foundation for creating a modern, accessible, and performant CommandHistory component. The patterns and utilities can be reused across other components in the application, creating a consistent and high-quality user experience.

Key principles to remember:
1. **Progressive Enhancement**: Build solid foundations first, then add enhancements
2. **Accessibility First**: Consider screen readers and keyboard users from the start
3. **Performance Conscious**: Optimize for both perceived and actual performance
4. **Mobile Friendly**: Design for touch interactions and small screens
5. **Error Resilient**: Provide clear feedback and recovery options
6. **Testable**: Write code that can be easily tested and validated

Follow this guide alongside the UX Migration Plan to ensure successful implementation of the improved CommandHistory component.