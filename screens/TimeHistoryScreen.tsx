import React, { useState, useEffect, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import SwipeableTimeEntry from '../components/SwipeableTimeEntry';

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  property_id: string | null;
  billing_category_id: string | null;
  unit_id: string | null;
  notes: string | null;
  status?: string;
  locked?: boolean;
  is_editable?: boolean;
}

interface Property {
  id: string;
  name: string;
}

interface BillingCategory {
  id: string;
  name: string;
}

interface PropertyUnit {
  id: string;
  name: string;
  property_id: string;
}

export default function TimeHistoryScreen() {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [billingCategories, setBillingCategories] = useState<BillingCategory[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Refetch when screen comes into focus (e.g., drawer opens after ending a session)
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  async function fetchData() {
    await Promise.all([
      fetchTimeEntries(),
      fetchProperties(),
      fetchBillingCategories(),
      fetchUnits(),
    ]);
    setLoading(false);
  }

  async function fetchTimeEntries() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Read from time_entries (source of truth post-submission)
      const { data, error } = await supabase
        .schema('orca')
        .from('time_entries')
        .select('id, start_ts, end_ts, duration_minutes, notes, status, locked, property_id, billing_category_id, unit_id')
        .eq('user_id', user.id)
        .order('start_ts', { ascending: false });

      if (error) throw error;

      // Map time_entries columns to TimeEntry interface
      const entries: TimeEntry[] = (data || []).map(e => ({
        id: e.id,
        start_time: e.start_ts,
        end_time: e.end_ts,
        property_id: e.property_id,
        billing_category_id: e.billing_category_id,
        unit_id: e.unit_id,
        notes: e.notes,
        status: e.status,
        locked: e.locked,
        is_editable: !e.locked && e.status !== 'invoiced',
      }));

      console.log('Fetched time entries:', entries);
      setTimeEntries(entries);
    } catch (error) {
      console.error('Error fetching time entries:', error);
    }
  }

  async function fetchProperties() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgMember } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember?.organization_id) return;

      const { data, error } = await supabase
        .schema('orca')
        .from('property')
        .select('id, name')
        .eq('organization_id', orgMember.organization_id)
        .eq('is_active', true)
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

      const { data: orgMember } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember?.organization_id) return;

      const { data, error } = await supabase
        .schema('orca')
        .from('billing_category')
        .select('id, name')
        .eq('organization_id', orgMember.organization_id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setBillingCategories(data || []);
    } catch (error) {
      console.error('Error fetching billing categories:', error);
    }
  }

  async function fetchUnits() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgMember } = await supabase
        .schema('orca')
        .from('organization_member')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!orgMember?.organization_id) return;

      // Get all units for properties belonging to this organization
      const { data, error } = await supabase
        .schema('orca')
        .from('property_unit')
        .select('id, name, property_id')
        .order('name');

      if (error) throw error;
      setUnits(data || []);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  async function handleDelete(id: string) {
    // Check if entry is editable
    const entry = timeEntries.find(e => e.id === id);
    if (entry && !entry.is_editable) {
      Alert.alert('Cannot Delete', 'This entry has been approved or invoiced and cannot be deleted.');
      return;
    }

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

  // Animated delete - no confirmation, swipe gesture is the confirmation
  async function handleAnimatedDelete(id: string) {
    // Check if entry is editable
    const entry = timeEntries.find(e => e.id === id);
    if (entry && !entry.is_editable) {
      Alert.alert('Cannot Delete', 'This entry has been approved or invoiced and cannot be deleted.');
      return;
    }

    // Remove from local state immediately (optimistic UI)
    setTimeEntries(prev => prev.filter(entry => entry.id !== id));

    // Delete from database in background
    try {
      const { error } = await supabase
        .schema('orca')
        .from('time_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting time entry:', error);
      Alert.alert('Error', 'Failed to delete time entry. Please refresh.');
      // Optionally refetch to restore state
      await fetchTimeEntries();
    }
  }

  // Update a time entry
  async function handleUpdate(id: string, updates: Partial<TimeEntry>) {
    // Check if entry is editable
    const entry = timeEntries.find(e => e.id === id);
    if (entry && !entry.is_editable) {
      Alert.alert('Cannot Edit', 'This entry has been approved or invoiced and cannot be edited.');
      throw new Error('Entry is not editable');
    }

    // Optimistic update
    setTimeEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, ...updates } : entry
      )
    );

    // Map interface field names to time_entries column names
    const dbUpdates: Record<string, any> = {};
    if (updates.start_time !== undefined) dbUpdates.start_ts = updates.start_time;
    if (updates.end_time !== undefined) dbUpdates.end_ts = updates.end_time;
    if (updates.property_id !== undefined) dbUpdates.property_id = updates.property_id;
    if (updates.billing_category_id !== undefined) dbUpdates.billing_category_id = updates.billing_category_id;
    if (updates.unit_id !== undefined) dbUpdates.unit_id = updates.unit_id;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

    // Recalculate duration if times changed
    if (dbUpdates.start_ts || dbUpdates.end_ts) {
      const startTs = dbUpdates.start_ts || entry?.start_time;
      const endTs = dbUpdates.end_ts || entry?.end_time;
      if (startTs && endTs) {
        dbUpdates.duration_minutes = Math.floor(
          (new Date(endTs).getTime() - new Date(startTs).getTime()) / 60000
        );
      }
    }

    try {
      const { error } = await supabase
        .schema('orca')
        .from('time_entries')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating time entry:', error);
      Alert.alert('Error', 'Failed to update time entry. Please refresh.');
      // Refetch to restore state
      await fetchTimeEntries();
      throw error; // Re-throw so the component knows it failed
    }
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
    const minutes = Math.floor((end - start) / 1000 / 60);
    console.log('Duration calc:', { startTs, endTs, start, end, minutes });
    return minutes;
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

  function getDayDivider(date: string): string {
    const entryDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time parts for comparison
    entryDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);

    if (entryDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (entryDate.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    } else {
      return entryDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }

  // Group entries by day and flatten for rendering
  function getGroupedEntries() {
    const grouped: Array<{ type: 'divider' | 'entry'; data: any; key: string }> = [];

    timeEntries.forEach((item, index) => {
      const showDivider = index === 0 ||
        new Date(item.start_time).toDateString() !== new Date(timeEntries[index - 1].start_time).toDateString();

      if (showDivider) {
        grouped.push({
          type: 'divider',
          data: getDayDivider(item.start_time),
          key: `divider-${item.start_time}`,
        });
      }

      grouped.push({
        type: 'entry',
        data: item,
        key: `entry-${item.id}`,
      });
    });

    return grouped;
  }

  function renderItem({ item }: { item: any }) {
    if (item.type === 'divider') {
      return (
        <View style={styles.dayDivider}>
          <Text style={styles.dayDividerText}>{item.data}</Text>
        </View>
      );
    }

    const entry = item.data;
    const property = properties.find(p => p.id === entry.property_id);
    const billingCategory = billingCategories.find(b => b.id === entry.billing_category_id);
    const unit = units.find(u => u.id === entry.unit_id);

    return (
      <SwipeableTimeEntry
        item={entry}
        property={property}
        billingCategory={billingCategory}
        unit={unit}
        properties={properties}
        billingCategories={billingCategories}
        onDelete={handleAnimatedDelete}
        onUpdate={handleUpdate}
        formatTime={formatTime}
        formatDuration={formatDuration}
      />
    );
  }

  function getStickyHeaderIndices() {
    const grouped = getGroupedEntries();
    return grouped
      .map((item, index) => (item.type === 'divider' ? index : null))
      .filter((index): index is number => index !== null);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a0a0a" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GestureHandlerRootView style={styles.innerContainer}>
        <StatusBar style="auto" />

        <FlatList
          data={getGroupedEntries()}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          stickyHeaderIndices={getStickyHeaderIndices()}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  innerContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  dayDivider: {
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fafafa',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  dayDividerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
    letterSpacing: -0.3,
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
