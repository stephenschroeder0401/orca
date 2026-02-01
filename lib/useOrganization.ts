import { useState, useEffect } from 'react';
import { supabase } from './supabase';

interface UseOrganizationResult {
  organizationId: string | null;
  loading: boolean;
  error: Error | null;
}

export function useOrganization(): UseOrganizationResult {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchOrganization();
  }, []);

  async function fetchOrganization() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: orgMember, error: orgMemberError } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (orgMemberError) throw orgMemberError;

      setOrganizationId(orgMember.organization_id);
    } catch (err) {
      console.error('Error fetching organization:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  return { organizationId, loading, error };
}
