import { useQuery } from '@tanstack/react-query';

import { fetchAudit, fetchChain } from './api';
import { keys } from './query-keys';

export const useAudit = () => useQuery({ queryKey: keys.audit, queryFn: fetchAudit });
export const useChain = () => useQuery({ queryKey: keys.chain, queryFn: fetchChain });
