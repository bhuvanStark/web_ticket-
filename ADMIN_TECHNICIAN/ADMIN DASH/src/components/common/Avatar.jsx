import React, { useState } from 'react';

/**
 * Profile picture with an initials fallback.
 *
 * Accounts loaded from the database have no avatar URL, and rendering
 * <img src={null}> shows the browser's broken-image icon. This renders
 * initials instead, and also falls back if a real URL fails to load.
 */
export const Avatar = ({ src, name, className = 'w-10 h-10', textClassName }) => {
  const [failed, setFailed] = useState(false);

  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (!src || failed) {
    return (
      <div
        className={`${className} rounded-full border border-[#D0D5DD] bg-[#004898] text-white flex items-center justify-center font-bold shrink-0`}
        title={name || ''}
        aria-label={name || 'User'}
      >
        <span className={`${textClassName || 'text-[11px]'} leading-none`}>{initials || '?'}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || 'User'}
      onError={() => setFailed(true)}
      className={`${className} rounded-full object-cover border border-[#D0D5DD] shrink-0`}
    />
  );
};
