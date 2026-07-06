import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import api from '../../api/axios';

const AdminLayout = ({ children }) => {
  const [adminMongoId, setAdminMongoId] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/api/auth/me');
        const userData = response.data?.user || response.data;
        if (userData && (userData.id || userData._id)) {
          setAdminMongoId(userData.id || userData._id);
        }
      } catch (err) {
        console.error('Error fetching admin database profile:', err);
      }
    };
    fetchProfile();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar />
      <div style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0
      }}>
        <TopBar adminMongoId={adminMongoId} />
        <main style={{
          padding: '32px',
          flex: 1,
          backgroundColor: 'var(--bg-primary)',
          overflowY: 'auto'
        }}>
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, { adminMongoId });
            }
            return child;
          })}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
