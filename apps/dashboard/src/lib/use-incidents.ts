import { useQuery } from '@tanstack/react-query';

import { fetchIncident, fetchIncidents } from './api';
import { keys } from './query-keys';

export const useIncidents = () => useQuery({ queryKey: keys.incidents, queryFn: fetchIncidents });
export const useIncident = (id: string) =>
  useQuery({ queryKey: keys.incident(id), queryFn: () => fetchIncident(id) });
