import { useEffect, useState } from 'react';
import { getDisplayName, rerollDisplayName, setDisplayName } from '@/lib/profile';

/**
 * React hook around the profile pseudonym. Subscribes to `profile-change`
 * events so UI stays in sync when the user rerolls or edits their name.
 */
export function useDisplayName() {
  const [name, setName] = useState<string>(() => getDisplayName());

  useEffect(() => {
    const handler = () => setName(getDisplayName());
    window.addEventListener('profile-change', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('profile-change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return {
    name,
    reroll: () => {
      const next = rerollDisplayName();
      setName(next);
      return next;
    },
    set: (value: string) => {
      setDisplayName(value);
      setName(getDisplayName());
    },
  };
}
