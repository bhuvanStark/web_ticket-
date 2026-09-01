import { useEffect, useState } from 'react';

export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);

    const handleChange = (e) => {
      setMatches(e.matches);
    };

    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
};

export const useIsMobile = () => {
  return useMediaQuery('(max-width: 767px)');
};

export const useIsTablet = () => {
  return useMediaQuery('(max-width: 1023px)');
};
