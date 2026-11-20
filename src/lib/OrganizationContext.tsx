import { createContext, useContext } from 'react';

export type OrganizationInfo = {
  organizationId: string;
  organizationName: string;
  role: string;
};

const OrganizationContext = createContext<OrganizationInfo | null>(null);

export const OrganizationProvider = OrganizationContext.Provider;

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error('Organization context is unavailable');
  return value;
}
