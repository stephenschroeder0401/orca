import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface Employee {
  id: string;
  organization_id: string;
  organization_member_id: string | null;
  name: string;
  email: string | null;
}

export function useAuth() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await fetchEmployee(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setEmployee(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetchEmployee(session.user.id);
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchEmployee(userId: string) {
    try {
      // Step 1: Get organization_member for this user
      const { data: orgMember, error: orgMemberError } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('id, organization_id')
        .eq('user_id', userId)
        .single();

      if (orgMemberError) throw orgMemberError;

      // Step 2: Get employee via organization_member_id
      const { data, error } = await supabase
        .schema('orca')
        .from('employee')
        .select('id, organization_id, organization_member_id, name, email')
        .eq('organization_member_id', orgMember.id)
        .single();

      if (error) throw error;
      setEmployee(data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setEmployee(null);
    }
  }

  return { employee, loading };
}
