import { useUiStore } from '../../store';
import type { PanelId } from '../../store/uiStore';

interface NavItem {
  id: PanelId | 'graph' | 'preview';
  label: string;
  icon: React.ReactNode;
}

const GraphIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
  </svg>
);

const PreviewIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const NodesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const PropertiesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  </svg>
);

const navItems: NavItem[] = [
  { id: 'graph', label: 'Graph', icon: <GraphIcon /> },
  { id: 'preview', label: 'Preview', icon: <PreviewIcon /> },
  { id: 'palette', label: 'Add', icon: <NodesIcon /> },
  { id: 'properties', label: 'Props', icon: <PropertiesIcon /> },
];

interface MobileBottomNavProps {
  onPanelChange: (panel: PanelId | null) => void;
}

export function MobileBottomNav({ onPanelChange }: MobileBottomNavProps) {
  const { viewMode, setViewMode, activeMobilePanel, setActiveMobilePanel } = useUiStore();

  const handleNavClick = (item: NavItem) => {
    if (item.id === 'graph' || item.id === 'preview') {
      // View mode changes
      setViewMode(item.id);
      setActiveMobilePanel(null);
      onPanelChange(null);
    } else {
      // Panel toggles
      const panelId = item.id as PanelId;
      if (activeMobilePanel === panelId) {
        setActiveMobilePanel(null);
        onPanelChange(null);
      } else {
        setActiveMobilePanel(panelId);
        onPanelChange(panelId);
      }
    }
  };

  const isActive = (item: NavItem) => {
    if (item.id === 'graph' || item.id === 'preview') {
      return viewMode === item.id && !activeMobilePanel;
    }
    return activeMobilePanel === item.id;
  };

  return (
    <nav className="flex-shrink-0 bg-editor-surface-solid/95 backdrop-blur-xl border-t border-editor-border safe-area-pb">
      <div className="flex items-stretch justify-around h-14">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative ${
                active
                  ? 'text-editor-accent'
                  : 'text-editor-text-dim active:text-editor-text'
              }`}
            >
              {/* Active indicator */}
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-editor-accent" />
              )}

              {/* Icon container with background on active */}
              <div className={`p-1.5 rounded-lg transition-all duration-200 ${
                active
                  ? 'bg-editor-accent/15'
                  : 'bg-transparent'
              }`}>
                {item.icon}
              </div>

              {/* Label */}
              <span className={`text-[10px] font-medium transition-colors ${
                active ? 'text-editor-accent' : ''
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
