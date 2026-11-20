import { useQuery } from '@tanstack/react-query';

import { fetchMode } from './api';
import { keys } from './query-keys';

export const useMode = () =>
  useQuery({ queryKey: keys.mode, queryFn: fetchMode, staleTime: 60_000 });
