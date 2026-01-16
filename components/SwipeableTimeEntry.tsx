import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const ACTION_WIDTH = 80;

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
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

interface SwipeableTimeEntryProps {
  item: TimeEntry;
  property?: Property;
  billingCategory?: BillingCategory;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  formatDate: (dateString: string) => string;
  formatTime: (dateString: string) => string;
  formatDuration: (startTs: string, endTs: string | null) => string;
}

export default function SwipeableTimeEntry({
  item,
  property,
  billingCategory,
  onDelete,
  onEdit,
  formatDate,
  formatTime,
  formatDuration,
}: SwipeableTimeEntryProps) {
  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(0);

  const handleDelete = () => {
    onDelete(item.id);
  };

  const handleEdit = () => {
    onEdit(item.id);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Only allow swipe left (negative values)
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -ACTION_WIDTH * 2);
      } else {
        translateX.value = Math.max(0, event.translationX * 0.2);
      }
    })
    .onEnd((event) => {
      if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withSpring(-ACTION_WIDTH * 2, {
          damping: 20,
          stiffness: 200,
        });
      } else {
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 200,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedHeightStyle = useAnimatedStyle(() => ({
    height: itemHeight.value,
    opacity: itemHeight.value === 0 ? 0 : 1,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.actionsContainer, animatedHeightStyle]}>
        <Pressable
          style={[styles.actionButton, styles.editButton]}
          onPress={() => {
            translateX.value = withSpring(0);
            handleEdit();
          }}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => {
            translateX.value = withSpring(0);
            handleDelete();
          }}
        >
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.entryCard, animatedStyle]}
          onLayout={(event) => {
            itemHeight.value = event.nativeEvent.layout.height;
          }}
        >
          <View style={styles.entryHeader}>
            <Text style={styles.entryDate}>{formatDate(item.start_time)}</Text>
            <Text style={styles.entryDuration}>
              {formatDuration(item.start_time, item.end_time)}
            </Text>
          </View>

          <View style={styles.entryTime}>
            <Text style={styles.entryTimeText}>
              {formatTime(item.start_time)} - {item.end_time ? formatTime(item.end_time) : 'In Progress'}
            </Text>
          </View>

          {item.notes && (
            <Text style={styles.entryNotes}>{item.notes}</Text>
          )}

          <View style={styles.entryDetails}>
            {property && (
              <View style={styles.entryDetail}>
                <Text style={styles.entryDetailLabel}>Property</Text>
                <Text style={styles.entryDetailValue}>{property.name}</Text>
              </View>
            )}
            {billingCategory && (
              <View style={styles.entryDetail}>
                <Text style={styles.entryDetailLabel}>Category</Text>
                <Text style={styles.entryDetailValue}>
                  {billingCategory.name}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  actionButton: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    marginLeft: 8,
    marginRight: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  entryDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a0a0a',
    letterSpacing: -0.5,
  },
  entryTime: {
    marginBottom: 12,
  },
  entryTimeText: {
    fontSize: 13,
    color: '#666',
  },
  entryNotes: {
    fontSize: 14,
    color: '#0a0a0a',
    marginBottom: 12,
    lineHeight: 20,
  },
  entryDetails: {
    gap: 8,
  },
  entryDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryDetailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 70,
  },
  entryDetailValue: {
    fontSize: 13,
    color: '#0a0a0a',
    flex: 1,
  },
});
