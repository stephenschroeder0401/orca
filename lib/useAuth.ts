import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface Employee {
  id: string;
  user_account_id: string;
  client_id: string;
  name: string;
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
      const { data, error } = await supabase
        .from('employee')
        .select('id, user_account_id, client_id, name')
        .eq('user_account_id', userId)
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
