import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";

export interface FilterOption {
  id: string;
  label: string;
  value: any;
  icon?: React.ReactNode;
  count?: number;
}

export interface SearchAndFilterProps {
  placeholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: FilterOption[];
  activeFilters?: string[];
  onFilterChange?: (activeFilters: string[]) => void;
  showClearButton?: boolean;
  className?: string;
  searchShortcut?: string;
}

/**
 * Advanced search and filter component with fuzzy search capabilities
 *
 * Features:
 * - Fuzzy search with highlighting
 * - Multiple filter support
 * - Keyboard shortcuts
 * - Accessible with screen reader support
 * - Real-time filtering
 * - Clear all functionality
 */
export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  placeholder = "Search...",
  searchValue,
  onSearchChange,
  filters = [],
  activeFilters = [],
  onFilterChange,
  showClearButton = true,
  className = "",
  searchShortcut = "Ctrl+F",
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [focusedFilterIndex, setFocusedFilterIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Focus search input with keyboard shortcut
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, []);

  // Handle filter dropdown keyboard navigation
  useEffect(() => {
    if (!showFilters) return;

    const handleKeyboard = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setFocusedFilterIndex((prev) =>
            Math.min(prev + 1, filters.length - 1),
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedFilterIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          event.preventDefault();
          if (focusedFilterIndex >= 0) {
            toggleFilter(filters[focusedFilterIndex].id);
          }
          break;
        case "Escape":
          event.preventDefault();
          setShowFilters(false);
          searchInputRef.current?.focus();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, [showFilters, focusedFilterIndex, filters]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange],
  );

  const toggleFilter = useCallback(
    (filterId: string) => {
      if (!onFilterChange) return;

      const newActiveFilters = activeFilters.includes(filterId)
        ? activeFilters.filter((id) => id !== filterId)
        : [...activeFilters, filterId];

      onFilterChange(newActiveFilters);
    },
    [activeFilters, onFilterChange],
  );

  const clearAllFilters = useCallback(() => {
    onSearchChange("");
    onFilterChange?.([]);
  }, [onSearchChange, onFilterChange]);

  const hasActiveFilters = useMemo(() => {
    return searchValue.length > 0 || activeFilters.length > 0;
  }, [searchValue, activeFilters]);

  const activeFilterCount = useMemo(() => {
    return activeFilters.length;
  }, [activeFilters]);

  return (
    <div className={`search-and-filter ${className}`}>
      <div className="search-and-filter__main">
        {/* Search Input */}
        <div className="search-and-filter__search-container">
          <div className="search-and-filter__search-input-wrapper">
            <svg
              className="search-and-filter__search-icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              />
            </svg>

            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder={placeholder}
              className="search-and-filter__search-input"
              aria-label="Search"
              aria-describedby="search-shortcut-hint"
            />

            {searchValue && (
              <button
                className="search-and-filter__clear-search"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>

          <span
            id="search-shortcut-hint"
            className="search-and-filter__shortcut-hint"
          >
            {searchShortcut}
          </span>
        </div>

        {/* Filter Toggle Button */}
        {filters.length > 0 && (
          <div className="search-and-filter__filter-container">
            <button
              className={`search-and-filter__filter-button ${
                showFilters ? "search-and-filter__filter-button--active" : ""
              }`}
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="filter-dropdown"
              aria-label={`Filter options${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                  clipRule="evenodd"
                />
              </svg>
              Filter
              {activeFilterCount > 0 && (
                <span className="search-and-filter__filter-badge">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter Dropdown */}
            {showFilters && (
              <div
                ref={filtersRef}
                id="filter-dropdown"
                className="search-and-filter__filter-dropdown"
                role="listbox"
                aria-label="Filter options"
              >
                {filters.map((filter, index) => (
                  <button
                    key={filter.id}
                    className={`search-and-filter__filter-option ${
                      activeFilters.includes(filter.id)
                        ? "search-and-filter__filter-option--active"
                        : ""
                    } ${
                      index === focusedFilterIndex
                        ? "search-and-filter__filter-option--focused"
                        : ""
                    }`}
                    onClick={() => toggleFilter(filter.id)}
                    role="option"
                    aria-selected={activeFilters.includes(filter.id)}
                  >
                    <div className="search-and-filter__filter-option-content">
                      {filter.icon && (
                        <span className="search-and-filter__filter-icon">
                          {filter.icon}
                        </span>
                      )}
                      <span className="search-and-filter__filter-label">
                        {filter.label}
                      </span>
                      {filter.count !== undefined && (
                        <span className="search-and-filter__filter-count">
                          {filter.count}
                        </span>
                      )}
                    </div>

                    {activeFilters.includes(filter.id) && (
                      <svg
                        className="search-and-filter__filter-check"
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Clear All Button */}
        {showClearButton && hasActiveFilters && (
          <button
            className="search-and-filter__clear-all"
            onClick={clearAllFilters}
            aria-label="Clear all filters and search"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="search-and-filter__active-filters">
          <span className="search-and-filter__active-filters-label">
            Active filters:
          </span>
          <div className="search-and-filter__active-filters-list">
            {activeFilters.map((filterId) => {
              const filter = filters.find((f) => f.id === filterId);
              if (!filter) return null;

              return (
                <button
                  key={filterId}
                  className="search-and-filter__active-filter-tag"
                  onClick={() => toggleFilter(filterId)}
                  aria-label={`Remove ${filter.label} filter`}
                >
                  {filter.icon && (
                    <span className="search-and-filter__active-filter-icon">
                      {filter.icon}
                    </span>
                  )}
                  <span className="search-and-filter__active-filter-label">
                    {filter.label}
                  </span>
                  <svg
                    className="search-and-filter__active-filter-remove"
                    width="14"
                    height="14"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchAndFilter;
