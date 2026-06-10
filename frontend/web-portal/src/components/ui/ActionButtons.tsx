'use client';

import { Pencil, Trash2 } from 'lucide-react';

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
}

export function ActionButtons({ onEdit, onDelete, editTitle = 'Edit', deleteTitle = 'Delete' }: ActionButtonsProps) {
  // stopPropagation lives on the buttons themselves (not a wrapper div) so the
  // clickable table row underneath doesn't also fire — and screen readers see
  // only real interactive elements.
  return (
    <div className="flex items-center gap-1">
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title={editTitle}
          aria-label={editTitle}
          className="p-1.5 rounded-lg text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={deleteTitle}
          aria-label={deleteTitle}
          className="p-1.5 rounded-lg text-danger hover:bg-danger-50 dark:hover:bg-red-900/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
