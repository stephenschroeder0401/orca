import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { WorkdayProvider } from './WorkdayContext';

interface Employee {
  id: string;
  organization_id: string;
  organization_member_id: string | null;
  name: string;
  email: string | null;
}

interface EmployeeContextType {
  employee: Employee | null;
  loading: boolean;
  error: boolean;
  logout: () => Promise<void>;
}

const EmployeeContext = createContext<EmployeeContextType | null>(null);

interface EmployeeProviderProps {
  children: ReactNode;
  userId: string;
  userEmail: string | undefined;
}

export function EmployeeProvider({ children, userId, userEmail }: EmployeeProviderProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchEmployee();
  }, [userId]);

  async function fetchEmployee() {
    console.log('[EmployeeContext] fetchEmployee started for userId:', userId);
    setLoading(true);
    setError(false);

    try {
      // Step 1: Get organization_member(s) for this user
      console.log('[EmployeeContext] Fetching organization_member(s)...');
      const { data: orgMembers, error: orgMemberError } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('id, organization_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (orgMemberError || !orgMembers || orgMembers.length === 0) {
        console.log('[EmployeeContext] No organization_member found:', orgMemberError?.message || 'no records');
        setEmployee(null);
        setError(true);
        setLoading(false);
        return;
      }

      const orgMember = orgMembers[0];
      if (orgMembers.length > 1) {
        console.log('[EmployeeContext] User belongs to', orgMembers.length, 'organizations, using first one');
      }
      console.log('[EmployeeContext] Got organization_member:', orgMember.id, 'org:', orgMember.organization_id);

      // Step 2: Try to get employee via organization_member_id first
      console.log('[EmployeeContext] Fetching employee by organization_member_id...');
      let { data: emp, error: empError } = await supabase
        .schema('orca')
        .from('employee')
        .select('id, organization_id, organization_member_id, name, email')
        .eq('organization_member_id', orgMember.id)
        .single();

      // Step 3: If not found by org_member_id, try by email within the same org
      if (empError || !emp) {
        console.log('[EmployeeContext] No employee by org_member_id, trying email lookup...');

        if (userEmail) {
          console.log('[EmployeeContext] Looking up employee by email:', userEmail);
          const { data: empByEmail, error: emailError } = await supabase
            .schema('orca')
            .from('employee')
            .select('id, organization_id, organization_member_id, name, email')
            .eq('organization_id', orgMember.organization_id)
            .eq('email', userEmail)
            .single();

          if (!emailError && empByEmail) {
            console.log('[EmployeeContext] Found employee by email:', empByEmail.name);
            emp = empByEmail;

            // Link the employee to the org_member for future lookups
            if (!empByEmail.organization_member_id) {
              console.log('[EmployeeContext] Linking employee to organization_member...');
              await supabase
                .schema('orca')
                .from('employee')
                .update({ organization_member_id: orgMember.id })
                .eq('id', empByEmail.id);
            }
          }
        }
      }

      if (!emp) {
        console.log('[EmployeeContext] No employee record found by any method');
        setEmployee(null);
        setError(true);
        setLoading(false);
        return;
      }

      console.log('[EmployeeContext] Got employee:', emp.name);
      setEmployee(emp);
      setError(false);
    } catch (err) {
      console.error('[EmployeeContext] Error fetching employee:', err);
      setEmployee(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    console.log('[EmployeeContext] logout called');
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[EmployeeContext] signOut error:', err);
    }
  }

  // Show loading while fetching employee
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Show error if no employee found
  if (error || !employee) {
    return (
      <View style={styles.errorContainer}>
        <Image
          source={require('../assets/orca-logo.png')}
          style={styles.errorLogo}
          resizeMode="contain"
        />
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No Employee Record</Text>
          <Text style={styles.errorMessage}>
            No employee record was found for your account. Please contact your organization administrator to set up your employee profile.
          </Text>
          <Text style={styles.errorEmail}>{userEmail}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Employee found - render children wrapped in WorkdayProvider
  return (
    <EmployeeContext.Provider value={{ employee, loading, error, logout }}>
      <WorkdayProvider employeeId={employee.id}>
        {children}
      </WorkdayProvider>
    </EmployeeContext.Provider>
  );
}

export function useEmployee(): EmployeeContextType {
  const context = useContext(EmployeeContext);
  if (!context) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    padding: 32,
  },
  errorLogo: {
    width: 120,
    height: 44,
    marginBottom: 32,
  },
  errorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  errorEmail: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  logoutButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1.5,
    borderColor: '#dc2626',
    borderRadius: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },
});
