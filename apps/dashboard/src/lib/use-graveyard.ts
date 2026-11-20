import { useQuery } from '@tanstack/react-query';

import { fetchGraveyard } from './api';
import { keys } from './query-keys';

export const useGraveyard = () =>
  useQuery({ queryKey: keys.graveyard, queryFn: fetchGraveyard, refetchInterval: 30_000 });
