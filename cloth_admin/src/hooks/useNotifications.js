import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import api from '../api/axios';

export const useNotifications = (adminMongoId) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminMongoId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('user_id', '==', adminMongoId),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      let unread = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({ id: doc.id, ...data });
        if (!data.is_read) {
          unread++;
        }
      });
      setNotifications(list);
      setUnreadCount(unread);
      setLoading(false);
    }, (error) => {
      console.error('Notifications snapshot listener error:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [adminMongoId]);

  const markAsRead = async (notificationId) => {
    try {
      const ref = doc(db, 'notifications', notificationId);
      await updateDoc(ref, { is_read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const promises = notifications
        .filter((n) => !n.is_read)
        .map((n) => updateDoc(doc(db, 'notifications', n.id), { is_read: true }));
      await Promise.all(promises);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead };
};
