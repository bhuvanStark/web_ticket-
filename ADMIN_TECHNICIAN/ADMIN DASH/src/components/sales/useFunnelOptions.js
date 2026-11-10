import { useEffect, useState } from 'react';
import { fetchFunnelOptions } from '../../services/leadsApiService';

// Product suggestions + branch list, fetched once per mount.
export function useFunnelOptions() {
  const [options, setOptions] = useState({ products: [], locations: [] });
  useEffect(() => {
    let live = true;
    fetchFunnelOptions()
      .then((data) => { if (live && data) setOptions({ products: data.products || [], locations: data.locations || [] }); })
      .catch((err) => console.warn('Funnel options unavailable:', err));
    return () => { live = false; };
  }, []);
  return options;
}
