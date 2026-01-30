import { usePDFStore } from '../../store';

// Icons
const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

interface PageNavigationProps {
  compact?: boolean;
}

export function PageNavigation({ compact = false }: PageNavigationProps) {
  const { currentPage, pages, prevPage, nextPage } = usePDFStore();

  if (pages.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center">
        <button
          onClick={prevPage}
          disabled={currentPage === 0}
          className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </button>
        <span className="text-surface-300 text-xs font-medium tabular-nums min-w-[3rem] text-center">
          {currentPage + 1} / {pages.length}
        </span>
        <button
          onClick={nextPage}
          disabled={currentPage >= pages.length - 1}
          className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-800/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={prevPage}
        disabled={currentPage === 0}
        className="px-3 py-1.5 text-sm font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-800/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1"
      >
        <ChevronLeftIcon />
        <span className="hidden sm:inline">Prev</span>
      </button>
      <div className="px-3 py-1.5 bg-surface-800/50 rounded-lg">
        <span className="text-surface-200 text-sm font-medium tabular-nums">
          Page {currentPage + 1}
        </span>
        <span className="text-surface-500 text-sm"> of {pages.length}</span>
      </div>
      <button
        onClick={nextPage}
        disabled={currentPage >= pages.length - 1}
        className="px-3 py-1.5 text-sm font-medium text-surface-300 hover:text-surface-100 hover:bg-surface-800/50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon />
      </button>
    </div>
  );
}
