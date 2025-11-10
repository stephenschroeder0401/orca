import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';
import SwipeableTimeEntry from '../components/SwipeableTimeEntry';

interface TimeEntry {
  id: string;
  start_ts: string;
  end_ts: string | null;
  property_id: string | null;
  billing_category_id: string | null;
  notes: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface BillingCategory {
  id: string;
  name: string;
}

export default function TimeHistoryScreen() {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    await Promise.all([
      fetchTimeEntries(),
      fetchProperties(),
      fetchBillingCategories(),
    ]);
    setLoading(false);
  }

  async function fetchTimeEntries() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .schema('orca')
        .from('clock_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('start_ts', { ascending: false });

      if (error) throw error;
      setTimeEntries(data || []);
    } catch (error) {
      console.error('Error fetching time entries:', error);
    }
  }

  async function fetchProperties() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userAccount } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!userAccount?.client_id) return;

      const { data, error } = await supabase
        .from('property')
        .select(`
          id,
          name,
          entity!inner(client_id)
        `)
        .eq('entity.client_id', userAccount.client_id)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  }

  async function fetchBillingCategories() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userAccount } = await supabase
        .from('user_account')
        .select('client_id')
        .eq('user_id', user.id)
        .single();

      if (!userAccount?.client_id) return;

      const { data, error } = await supabase
        .from('billing_account')
        .select('id, name')
        .eq('client_id', userAccount.client_id)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setBillingCategories(data || []);
    } catch (error) {
      console.error('Error fetching billing categories:', error);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function handleDelete(id: string) {
    Alert.alert(
      'Delete Time Entry',
      'Are you sure you want to delete this time entry?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .schema('orca')
                .from('time_entries')
                .delete()
                .eq('id', id);

              if (error) throw error;

              // Refresh the list
              await fetchTimeEntries();
            } catch (error) {
              console.error('Error deleting time entry:', error);
              Alert.alert('Error', 'Failed to delete time entry');
            }
          },
        },
      ]
    );
  }

  function handleEdit(id: string) {
    // TODO: Navigate to edit screen
    Alert.alert('Edit', `Edit time entry ${id}`);
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }

  function calculateDuration(startTs: string, endTs: string | null): number {
    if (!endTs) return 0;
    const start = new Date(startTs).getTime();
    const end = new Date(endTs).getTime();
    return Math.floor((end - start) / 1000 / 60); // Convert to minutes
  }

  function formatDuration(startTs: string, endTs: string | null): string {
    const minutes = calculateDuration(startTs, endTs);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  function renderTimeEntry({ item }: { item: TimeEntry }) {
    const property = properties.find(p => p.id === item.property_id);
    const billingCategory = billingCategories.find(b => b.id === item.billing_category_id);

    return (
      <SwipeableTimeEntry
        item={item}
        property={property}
        billingCategory={billingCategory}
        onDelete={handleDelete}
        onEdit={handleEdit}
        formatDate={formatDate}
        formatTime={formatTime}
        formatDuration={(startTs: string, endTs: string | null) => formatDuration(startTs, endTs)}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a0a0a" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="auto" />

      <FlatList
        data={timeEntries}
        renderItem={renderTimeEntry}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No time entries yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Start tracking time to see your history here
            </Text>
          </View>
        }
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  listContent: {
    padding: 16,
    paddingTop: 60,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a0a0a',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#666',
  },
});
