'use client';

import { useState } from 'react';

interface EscalationRequest {
  name: string;
  email: string;
  phone: string;
  zipCode: string;
  dateTime: string;
}

export default function EscalationRequestsTable() {
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data - replace with actual data from your API
  const data: EscalationRequest[] = [
    { name: 'Maria Rodriguez', email: 'maria.rodriguez@email.com', phone: '(555) 234-5678', zipCode: '85001', dateTime: 'Dec 21, 2:34 PM' },
    { name: 'James Smith', email: 'james.smith@email.com', phone: '(555) 987-6543', zipCode: '85002', dateTime: 'Dec 22, 10:30 AM' },
    { name: 'Aisha Khan', email: 'aisha.khan@email.com', phone: '-', zipCode: '-', dateTime: 'Dec 23, 1:45 PM' },
    { name: 'Liam Johnson', email: 'liam.johnson@email.com', phone: '(555) 321-0987', zipCode: '85004', dateTime: 'Dec 24, 4:20 PM' },
    { name: 'Sofia Garcia', email: 'sofia.garcia@email.com', phone: '-', zipCode: '85005', dateTime: 'Dec 25, 3:15 PM' },
    { name: 'Ethan Lee', email: 'ethan.lee@email.com', phone: '(555) 789-0123', zipCode: '-', dateTime: 'Dec 26, 11:00 AM' },
    { name: 'Olivia Brown', email: 'olivia.brown@email.com', phone: '-', zipCode: '-', dateTime: 'Dec 27, 9:45 AM' },
  ];

  const filteredData = data.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div 
      style={{ 
        backgroundColor: 'white', 
        border: '1px solid #e2e8f0', 
        borderRadius: '15px', 
        boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.1)',
        padding: '24px'
      }}
    >
      {/* Header row: Title on left, Search on right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ color: '#a6192e', fontSize: '18px', fontWeight: 500, margin: 0 }}>Escalation Requests</h2>
        
        {/* Search bar */}
        <div style={{ position: 'relative', width: '280px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email"
            className="placeholder:text-[#94a3b8]"
            style={{
              width: '100%',
              height: '44px',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              paddingLeft: '40px',
              paddingRight: '16px',
              fontSize: '14px',
              lineHeight: '20px',
              color: '#020617',
              outline: 'none',
              backgroundColor: 'white',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <path
              d="M11.3333 9.33333H10.5933L10.3267 9.07333C11.1733 8.06 11.6667 6.75333 11.6667 5.33333C11.6667 2.38667 9.28 0 6.33333 0C3.38667 0 1 2.38667 1 5.33333C1 8.28 3.38667 10.6667 6.33333 10.6667C7.75333 10.6667 9.06 10.1733 10.0733 9.32667L10.3333 9.59333V10.3333L14.3333 14.3267L15.6667 12.9933L11.3333 9.33333ZM6.33333 9.33333C4.12667 9.33333 2.33333 7.54 2.33333 5.33333C2.33333 3.12667 4.12667 1.33333 6.33333 1.33333C8.54 1.33333 10.3333 3.12667 10.3333 5.33333C10.3333 7.54 8.54 9.33333 6.33333 9.33333Z"
              fill="#94a3b8"
            />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: '#a6192e', fontSize: '14px', fontWeight: 500, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white' }}>Name</th>
              <th style={{ textAlign: 'left', color: '#a6192e', fontSize: '14px', fontWeight: 500, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white' }}>Email</th>
              <th style={{ textAlign: 'left', color: '#a6192e', fontSize: '14px', fontWeight: 500, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white' }}>Phone</th>
              <th style={{ textAlign: 'left', color: '#a6192e', fontSize: '14px', fontWeight: 500, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white' }}>ZIP Code</th>
              <th style={{ textAlign: 'left', color: '#a6192e', fontSize: '14px', fontWeight: 500, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white' }}>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc' }}>
                <td style={{ color: '#020617', fontSize: '14px', fontWeight: 400, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', lineHeight: '20px' }}>{item.name}</td>
                <td style={{ color: '#020617', fontSize: '14px', fontWeight: 400, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', lineHeight: '20px' }}>{item.email}</td>
                <td style={{ color: '#020617', fontSize: '14px', fontWeight: 400, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', lineHeight: '20px' }}>{item.phone}</td>
                <td style={{ color: '#020617', fontSize: '14px', fontWeight: 400, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', lineHeight: '20px' }}>{item.zipCode}</td>
                <td style={{ color: '#020617', fontSize: '14px', fontWeight: 400, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', lineHeight: '20px' }}>{item.dateTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

