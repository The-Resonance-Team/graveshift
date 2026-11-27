/** The small action descriptor passed to the one policy decision seam. */
export interface PolicyAction {
  name: string;
  params?: { replicas?: number };
}

/** The one place the runtime boundary is named. A draft pull request is not runtime. */
export const isRuntimeAction = (action: PolicyAction): boolean => action.name !== 'open_pr';
