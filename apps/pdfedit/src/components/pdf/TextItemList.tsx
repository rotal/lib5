import { usePDFStore, FONT_OPTIONS, type FontName } from '../../store';

// Icons
const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

interface TextItemListProps {
  compact?: boolean;
}

export function TextItemList({ compact = false }: TextItemListProps) {
  const {
    pages,
    currentPage,
    editingId,
    setEditingId,
    updateTextItem,
    updateItemFont,
  } = usePDFStore();

  const currentPageData = pages[currentPage];

  if (!currentPageData) {
    return (
      <div className="flex items-center justify-center h-32 text-surface-500 text-sm">
        No page loaded
      </div>
    );
  }

  if (currentPageData.textItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center p-4">
        <p className="text-surface-500 text-sm">No text found on this page</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : ''}`}>
      {/* Header for mobile compact view */}
      {compact && (
        <div className="px-4 py-3 bg-surface-800/50 border-b border-surface-700/30 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-surface-200">
              Text Items
            </span>
            <span className="text-xs text-surface-500">
              {currentPageData.textItems.length} items
            </span>
          </div>
        </div>
      )}

      {/* Text items */}
      <div className="divide-y divide-surface-700/30 overflow-auto flex-1">
        {currentPageData.textItems.map((item, idx) => (
          <div
            key={item.id}
            className={`group relative transition-colors ${
              item.modified
                ? 'bg-modified-500/5 hover:bg-modified-500/10'
                : 'hover:bg-surface-800/30'
            } ${editingId === item.id ? 'bg-accent-500/10' : ''}`}
            onClick={() => !editingId && setEditingId(item.id)}
          >
            <div className="p-3 flex gap-3">
              {/* Index number */}
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <span className="text-[10px] font-medium text-surface-600 tabular-nums w-5 text-center">
                  {idx + 1}
                </span>
                {item.modified && (
                  <span className="w-2 h-2 rounded-full bg-modified-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateTextItem(item.id, e.target.value)}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingId(null);
                        if (e.key === 'Escape') {
                          updateTextItem(item.id, item.originalText);
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      className="input text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={item.detectedFont}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateItemFont(item.id, e.target.value as FontName);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="select flex-1"
                      >
                        {FONT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        className="p-1.5 bg-success-500/20 text-success-400 rounded-md hover:bg-success-500/30 transition-colors"
                      >
                        <CheckIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className={`text-sm break-words leading-relaxed ${
                        item.modified ? 'text-modified-300' : 'text-surface-200'
                      }`}
                    >
                      {item.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <select
                        value={item.detectedFont}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateItemFont(item.id, e.target.value as FontName);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="select"
                      >
                        {FONT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {!compact && item.fontName && (
                        <span
                          className="text-[10px] text-surface-600 truncate max-w-[100px]"
                          title={item.fontName}
                        >
                          {item.fontName}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Edit button (shown on hover) */}
              {editingId !== item.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(item.id);
                  }}
                  className="p-1.5 opacity-0 group-hover:opacity-100 text-surface-500 hover:text-accent-400 hover:bg-surface-800/50 rounded-md transition-all"
                  aria-label="Edit text"
                >
                  <EditIcon />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
