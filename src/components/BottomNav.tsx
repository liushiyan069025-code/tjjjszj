// ============================================================
// BottomNav - 底部 Tab 导航
// ============================================================

import React from 'react';
import { CartoonIcon } from './CartoonIcon';
import type { IconName } from '../constants/icons';

interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

interface BottomNavProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-mobile bg-gray-900/95 backdrop-blur-md border-t border-gray-700/80 z-50 safe-area-bottom">
      <div className="flex justify-around items-center h-[4.25rem]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-4 py-1 transition-all ${
              isActive
                ? 'text-primary-400 scale-105'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {isActive && (
              <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-gold" />
            )}
            <CartoonIcon
              name={tab.icon}
              size="nav"
              className={isActive ? 'drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'opacity-80'}
            />
            <span className={`text-xs ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
          </button>
        );})}
      </div>
    </nav>
  );
};
